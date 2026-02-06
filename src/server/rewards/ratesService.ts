import { div } from 'biggystring'

import {
  type ExchangeRateResult,
  asExchangeRateResult,
  asRatesResponse
} from '../../common/rewardsTypes'
import { snooze } from '../../common/utils'

const RATES_SERVER_URLS = ['https://rates1.edge.app', 'https://rates2.edge.app']

// ---------- Utilities ----------

/** Shuffles array in place using Fisher-Yates and returns it. */
const shuffleArray = <T>(array: T[]): T[] => {
  const out = [...array]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

type AsyncFunction = () => Promise<any>

/**
 * Async waterfall pattern from edge-info-server. Starts each function
 * sequentially with a timeout. If a function times out, the next one
 * starts while the previous one continues racing. First successful
 * result wins.
 */
async function asyncWaterfall(
  asyncFuncs: AsyncFunction[],
  timeoutMs: number = 5000
): Promise<any> {
  let pending = asyncFuncs.length
  const promises: Array<Promise<any>> = []
  for (const func of asyncFuncs) {
    const index = promises.length
    promises.push(
      func().catch((e) => {
        e.index = index
        throw e
      })
    )
    if (pending > 1) {
      promises.push(
        new Promise((resolve) => {
          snooze(timeoutMs)
            .then(() => {
              resolve('async_waterfall_timed_out')
            })
            .catch((e) => console.error(e))
        })
      )
    }
    try {
      const result = await Promise.race(promises)
      if (result === 'async_waterfall_timed_out') {
        const p = promises.pop()
        p?.then().catch()
        --pending
      } else {
        return result
      }
    } catch (e: any) {
      const i = e.index
      promises.splice(i, 1)
      const p = promises.pop()
      p?.then().catch()
      --pending
      if (pending === 0) {
        throw e
      }
    }
  }
}

// ---------- Exchange Rate Lookup ----------

/**
 * Fetch the current exchange rate from the Edge rates server v3 API,
 * convert the given USD amount to crypto, and return both values.
 *
 * Uses asyncWaterfall with shuffled server URLs for load balancing and
 * failover.
 */
export const fetchExchangeRate = async (
  currencyPluginId: string,
  usdAmount: string
): Promise<ExchangeRateResult> => {
  const servers = shuffleArray(RATES_SERVER_URLS)

  const funcs = servers.map((server) => async () => {
    const response = await fetch(`${server}/v3/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetFiat: 'USD',
        crypto: [
          {
            asset: {
              pluginId: currencyPluginId,
              tokenId: null
            }
          }
        ],
        fiat: []
      })
    })

    if (!response.ok) {
      throw new Error(`Rate server ${server} returned ${response.status}`)
    }

    return response
  })

  const response = await asyncWaterfall(funcs)
  const data = asRatesResponse(await response.json())

  const rate = data.crypto[0]?.rate
  if (rate == null) {
    throw new Error('Exchange rate not found in response')
  }

  const exchangeRate = rate.toString()
  const cryptoAmount = div(usdAmount, exchangeRate, 8)

  console.log(
    `Rate lookup: ${usdAmount} USD / ${exchangeRate} = ${cryptoAmount} crypto`
  )

  return asExchangeRateResult({ cryptoAmount, exchangeRate })
}
