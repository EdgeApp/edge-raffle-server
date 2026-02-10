import { Router } from 'express'

import {
  type RaffleEntry,
  asRaffleEntries,
  asRaffleEntryRequest
} from '../../common/types'
import { validateCaptchaToken } from '../shared/captchaService'
import { checkDuplicates, getCampaignById, getRaffleDb } from './raffleDatabase'

export const raffleRouter = Router()

const db = getRaffleDb()

// ---------------------------------------------------------------------------
// GET /api/campaign/:id  – return campaign config for the client
// ---------------------------------------------------------------------------

raffleRouter.get('/api/campaign/:id', async (req, res) => {
  const campaignId = req.params.id
  console.log(`Serving campaign config for: ${campaignId}`)

  try {
    const campaign = await getCampaignById(campaignId)
    if (campaign == null) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    // Return client-safe fields only (strip _rev)
    return res.json({
      _id: campaign._id,
      title: campaign.title,
      subtitle: campaign.subtitle,
      mode: campaign.mode
    })
  } catch (error) {
    console.error('Error fetching campaign:', error)
    return res.status(500).json({ error: 'Failed to fetch campaign' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/getEntries?campaignId=...  – list entries for a campaign
// ---------------------------------------------------------------------------

raffleRouter.get('/api/getEntries', async (req, res) => {
  const campaignId = req.query.campaignId as string | undefined
  console.log('Serving getEntries', campaignId)

  const selector: Record<string, any> = {}
  if (campaignId != null && campaignId !== '') {
    selector.campaignId = campaignId
  }

  const result = await db.find({
    selector,
    limit: 1000
  })

  const entries = asRaffleEntries(result.docs)

  let entriesText = '<html><body><pre>\n'
  for (const entry of entries) {
    const label = entry.nameHandle !== '' ? entry.nameHandle : '(handle entry)'
    entriesText += `${label}: ${entry.publicAddress.slice(0, 6)}\n`
  }
  entriesText += '</pre></body></html>'

  res.send(entriesText)
})

// ---------------------------------------------------------------------------
// POST /api/addEntry  – add a raffle entry
// ---------------------------------------------------------------------------

raffleRouter.post('/api/addEntry', async (req, res) => {
  console.log('Serving addEntry')
  try {
    const {
      campaignId,
      nameHandle,
      emailAddress,
      publicAddress,
      captchaToken
    } = asRaffleEntryRequest(req.body)

    if (publicAddress === '') {
      return res.status(400).json({ error: 'publicAddress cannot be empty' })
    }

    // Look up the campaign to validate it exists
    const campaign = await getCampaignById(campaignId)
    if (campaign == null) {
      return res.status(404).json({ error: 'Campaign not found' })
    }

    // Mode-specific validation
    if (campaign.mode === 'email') {
      if (nameHandle === '' || emailAddress === '') {
        return res
          .status(400)
          .json({ error: 'Name and email address are required' })
      }
    } else {
      // handle mode
      if (nameHandle === '') {
        return res.status(400).json({ error: 'Handle is required' })
      }
    }

    // Validate captcha token
    const isValidCaptcha = await validateCaptchaToken(captchaToken)
    if (!isValidCaptcha) {
      return res.status(400).json({ error: 'Invalid captcha token' })
    }

    try {
      await checkDuplicates(db, publicAddress, campaignId)
    } catch (error: any) {
      return res.status(409).send(error.message)
    }

    const maxRetries = 5
    let retries = 0

    while (retries < maxRetries) {
      try {
        const isoDate = new Date().toISOString()
        const docId = `${campaignId}:${isoDate}`

        const entry: RaffleEntry = {
          campaignId,
          nameHandle,
          emailAddress: emailAddress ?? '',
          publicAddress,
          isoDate,
          raffleId: campaignId
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
      error: 'Invalid request body: campaignId and publicAddress are required'
    })
  }
})
