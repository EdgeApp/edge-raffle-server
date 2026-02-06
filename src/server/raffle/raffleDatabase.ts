import nano from 'nano'

import { config } from '../../config'

const couch = nano(config.couchDbFullpath)

/**
 * Initialize the raffle_entries database and create indexes if they
 * don't already exist.
 */
export const initRaffleDatabase = async (): Promise<void> => {
  try {
    await couch.db.create('raffle_entries')
    console.log('Created raffle_entries database')
  } catch (error: any) {
    if (error.statusCode !== 412) {
      console.error('Error creating database:', error)
    }
  }

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

/** Get a reference to the raffle_entries database. */
export const getRaffleDb = (): nano.DocumentScope<any> => {
  return couch.use('raffle_entries')
}

/**
 * Check if a public address already exists for the given raffle.
 * Throws if a duplicate is found.
 */
export const checkDuplicates = async (
  db: nano.DocumentScope<any>,
  nameHandle: string,
  publicAddress: string,
  raffleId: string
): Promise<void> => {
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
