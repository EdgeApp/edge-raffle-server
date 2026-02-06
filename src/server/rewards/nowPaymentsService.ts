import {
  PayoutResult,
  asNowPaymentsAuthResponse,
  asNowPaymentsPayoutResponse,
  asPayoutResult
} from '../../common/rewardsTypes'
import { config } from '../../config'

const NP_BASE_URL = 'https://api.nowpayments.io/v1'

/**
 * Authenticate with the NOWPayments API to obtain a JWT token.
 */
const authenticate = async (): Promise<string> => {
  const response = await fetch(`${NP_BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.nowPaymentsEmail,
      password: config.nowPaymentsPassword
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`NOWPayments auth failed: ${response.status}: ${text}`)
  }

  const data = asNowPaymentsAuthResponse(await response.json())
  return data.token
}

/**
 * Send a crypto payout via the NOWPayments Mass Payments API.
 *
 * 1. Authenticate with email/password to get a JWT token
 * 2. Create payout with the token + API key
 */
export const sendPayout = async (params: {
  address: string
  currency: string
  amount: string
}): Promise<PayoutResult> => {
  const { address, currency, amount } = params

  console.log(`Sending payout: ${amount} ${currency} to ${address}`)

  // Step 1: Authenticate
  const token = await authenticate()

  // Step 2: Create payout
  const response = await fetch(`${NP_BASE_URL}/payout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.nowPaymentsApiKey,
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      withdrawals: [
        {
          address,
          currency,
          amount: parseFloat(amount)
        }
      ]
    })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`NOWPayments payout failed: ${response.status}: ${text}`)
  }

  const data = asNowPaymentsPayoutResponse(await response.json())
  console.log('NOWPayments payout response:', JSON.stringify(data, null, 2))

  const withdrawalStatus = data.withdrawals[0]?.status ?? 'unknown'

  return asPayoutResult({
    payoutId: data.id,
    status: withdrawalStatus
  })
}
