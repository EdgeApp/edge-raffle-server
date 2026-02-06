import { Router } from 'express'

import {
  RaffleEntry,
  asRaffleEntries,
  asRaffleEntryRequest
} from '../../common/types'
import { config } from '../../config'
import { validateCaptchaToken } from '../shared/captchaService'
import { checkDuplicates, getRaffleDb } from './raffleDatabase'

export const raffleRouter = Router()

const db = getRaffleDb()

raffleRouter.get('/api/getEntries', async (req, res) => {
  console.log('Serving getEntries')
  const result = await db.find({
    selector: {
      raffleId: config.raffleId
    },
    limit: 1000
  })

  const entries = asRaffleEntries(result.docs)

  let entriesText = '<html><body><pre>\n'
  for (const entry of entries) {
    entriesText += `${entry.nameHandle}: ${entry.publicAddress.slice(0, 6)}\n`
  }
  entriesText += '</pre></body></html>'

  res.send(entriesText)
})

raffleRouter.post('/api/addEntry', async (req, res) => {
  console.log('Serving addEntry')
  try {
    const { nameHandle, emailAddress, publicAddress, captchaToken } =
      asRaffleEntryRequest(req.body)

    if (nameHandle === '' || publicAddress === '') {
      return res
        .status(400)
        .json({ error: 'nameHandle and publicAddress cannot be empty strings' })
    }

    // Validate captcha token
    const isValidCaptcha = await validateCaptchaToken(captchaToken)
    if (!isValidCaptcha) {
      return res.status(400).json({ error: 'Invalid captcha token' })
    }

    try {
      await checkDuplicates(db, nameHandle, publicAddress, config.raffleId)
    } catch (error: any) {
      return res.status(409).send(error.message)
    }

    const maxRetries = 5
    let retries = 0

    while (retries < maxRetries) {
      try {
        const isoDate = new Date().toISOString()
        const docId = `${config.raffleId}:${isoDate}`

        const entry: RaffleEntry = {
          nameHandle,
          publicAddress,
          isoDate,
          raffleId: config.raffleId
        }

        await db.insert(entry, docId)
        return res.json({ success: true })
      } catch (error: any) {
        if (error.statusCode === 409) {
          // Document conflict, retry with a new timestamp
          retries++
          await new Promise((resolve) => setTimeout(resolve, 100))
          continue
        }
        console.error('Error adding entry:', error)
        return res.status(500).json({ error: 'Failed to add entry' })
      }
    }

    return res.status(500).json({ error: 'Failed to add entry after retries' })
  } catch (error) {
    console.error('Validation error:', error)
    return res.status(400).json({
      error: 'Invalid request body: nameHandle and publicAddress are required'
    })
  }
})
