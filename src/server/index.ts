import express from 'express'
import nano from 'nano'
import cors from 'cors'
import path from 'path'
import {
  RaffleEntry,
  asRaffleEntries,
  asRaffleEntryRequest
} from '../common/types'
import { config } from '../config'
import { clientConfig } from '../clientConfig'

const app = express()

// Enable CORS and JSON parsing
app.use(cors())
app.use(express.json())

const couch = nano(config.couchDbFullpath)

// Validate Prosopo captcha token
const validateCaptchaToken = async (token: string): Promise<boolean> => {
  console.log('Validating captcha token')
  try {
    const response = await fetch('https://api.prosopo.io/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        secret: config.prosopoApiKey
      })
    })

    if (!response.ok) {
      const text = await response.text()
      const errorString = `validateCaptchaToken failure response: ${response.status}: ${text}`
      console.log(errorString)
      throw new Error(errorString)
    }

    const data = await response.json()
    console.log('validateCaptchaToken data:', JSON.stringify(data, null, 2))
    return data.status === 'ok' && data.verified === true
  } catch (error: any) {
    console.log('Error validating captcha:', error.message)
    return false
  }
}

// Create the raffle_entries database and setup indexes if they don't exist
const initDatabase = async () => {
  try {
    await couch.db.create('raffle_entries')
    console.log('Created raffle_entries database')
  } catch (error: any) {
    if (error.statusCode !== 412) {
      console.error('Error creating database:', error)
    }
  }

  // Setup indexes for checking duplicates
  const db = couch.use('raffle_entries')
  try {
    const existingIndexes = await db.list({
      startkey: '_design/',
      endkey: '_design0'
    })

    const handleIndexExists = existingIndexes.rows.some(
      (row) => row.id === '_design/idx_handle'
    )
    const addressIndexExists = existingIndexes.rows.some(
      (row) => row.id === '_design/idx_address'
    )

    if (!handleIndexExists) {
      await db.createIndex({
        index: {
          fields: ['nameHandle']
        },
        name: 'idx_handle'
      })
      console.log('Created handle index')
    }

    if (!addressIndexExists) {
      await db.createIndex({
        index: {
          fields: ['publicAddress']
        },
        name: 'idx_address'
      })
      console.log('Created address index')
    }
  } catch (error) {
    console.error('Error managing indexes:', error)
  }
}

initDatabase()

const db = couch.use('raffle_entries')

// Check if a handle or address already exists for the current raffle
const checkDuplicates = async (
  nameHandle: string,
  publicAddress: string,
  raffleId: string
) => {
  // Check for duplicate address
  const addressResult = await db.find({
    selector: {
      raffleId,
      publicAddress
    },
    limit: 1,
    use_index: 'idx_address'
  })

  if (addressResult.docs.length > 0) {
    throw new Error('This address is already registered for the raffle')
  }
}

app.get('/api/getEntries', async (req, res) => {
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

// Add a raffle entry
app.post('/api/addEntry', async (req, res) => {
  console.log('Serving addEntry')
  try {
    const { nameHandle, publicAddress, captchaToken } = asRaffleEntryRequest(
      req.body
    )

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
      await checkDuplicates(nameHandle, publicAddress, config.raffleId)
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

app.use(express.static(path.join(__dirname, '../../dist')))

// Add this to handle client-side routing
app.get('/', (req, res) => {
  console.log('Serving index.html')
  res.sendFile(path.join(__dirname, '../../dist/index.html'))
})

app.listen(clientConfig.appPort, () => {
  console.log(`Server running at http://localhost:${clientConfig.appPort}`)
})
