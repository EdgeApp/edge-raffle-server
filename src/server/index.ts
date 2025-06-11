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

interface CouchIndex {
  name: string
  def: {
    fields: Array<{
      [key: string]: string
    }>
  }
}

interface CouchIndexResponse {
  total_rows: number
  indexes: CouchIndex[]
}

interface CouchDatabase extends nano.DocumentScope<unknown> {
  getIndexes(): Promise<CouchIndexResponse>
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
  const db = couch.use('raffle_entries') as CouchDatabase
  try {
    const existingIndexes = await db.getIndexes()

    const handleIndexExists = existingIndexes.indexes.some(
      (idx: CouchIndex) => idx.name === 'idx_handle'
    )
    const addressIndexExists = existingIndexes.indexes.some(
      (idx: CouchIndex) => idx.name === 'idx_address'
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
  // Check for duplicate handle
  const handleResult = await db.find({
    selector: {
      raffleId,
      nameHandle
    },
    limit: 1,
    use_index: 'idx_handle'
  })

  if (handleResult.docs.length > 0) {
    throw new Error('This handle is already registered for the raffle')
  }

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
    throw new Error('This Monero address is already registered for the raffle')
  }
}

// Add a raffle entry
app.post('/api/addEntry', async (req, res) => {
  try {
    const { nameHandle, publicAddress } = asRaffleEntryRequest(req.body)

    if (nameHandle === '' || publicAddress === '') {
      return res
        .status(400)
        .json({ error: 'nameHandle and publicAddress cannot be empty strings' })
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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'))
})

app.listen(appPort, () => {
  console.log(`Server running at http://localhost:${appPort}`)
})
