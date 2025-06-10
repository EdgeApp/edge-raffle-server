import express from 'express'
import nano from 'nano'
import cors from 'cors'
import path from 'path'
import { RaffleEntry, asRaffleEntryRequest } from '../common/types'
import { config } from '../config'
import { appPort } from '../common/values'

const app = express()

// Enable CORS and JSON parsing
app.use(cors())
app.use(express.json())

const couch = nano(config.couchDbFullpath)

// Create the raffle_entries database if it doesn't exist
const initDatabase = async () => {
  try {
    await couch.db.create('raffle_entries')
    console.log('Created raffle_entries database')
  } catch (error: any) {
    if (error.statusCode !== 412) {
      console.error('Error creating database:', error)
    }
  }
}

initDatabase()

const db = couch.use('raffle_entries')

// Add a raffle entry
app.post('/api/addEntry', async (req, res) => {
  try {
    const { nameHandle, publicAddress } = asRaffleEntryRequest(req.body)

    if (nameHandle === '' || publicAddress === '') {
      return res
        .status(400)
        .json({ error: 'nameHandle and publicAddress cannot be empty strings' })
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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'))
})

app.listen(appPort, () => {
  console.log(`Server running at http://localhost:${appPort}`)
})
