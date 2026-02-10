import nano from 'nano'

import { asRaffleCampaign, type RaffleCampaign } from '../../common/types'
import { config } from '../../config'

const couch = nano(config.couchDbFullpath)

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

const ensureDb = async (name: string): Promise<void> => {
  try {
    await couch.db.create(name)
    console.log(`Created ${name} database`)
  } catch (error: any) {
    if (error.statusCode !== 412) {
      console.error(`Error creating ${name} database:`, error)
    }
  }
}

const ensureIndex = async (
  db: nano.DocumentScope<any>,
  name: string,
  fields: string[]
): Promise<void> => {
  const existing = await db.list({
    startkey: '_design/',
    endkey: '_design0'
  })
  const exists = existing.rows.some((row) => row.id === `_design/${name}`)
  if (!exists) {
    await db.createIndex({ index: { fields }, name })
    console.log(`Created index ${name}`)
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the raffle_entries and raffle_campaigns databases and create
 * indexes if they don't already exist.
 */
export const initRaffleDatabase = async (): Promise<void> => {
  // raffle_entries ---------------------------------------------------------
  await ensureDb('raffle_entries')
  const entriesDb = couch.use('raffle_entries')
  try {
    await ensureIndex(entriesDb, 'idx_handle', ['nameHandle'])
    await ensureIndex(entriesDb, 'idx_address', ['publicAddress'])
    await ensureIndex(entriesDb, 'idx_campaign', ['campaignId'])
  } catch (error) {
    console.error('Error managing raffle_entries indexes:', error)
  }

  // raffle_campaigns -------------------------------------------------------
  await ensureDb('raffle_campaigns')
}

// ---------------------------------------------------------------------------
// raffle_entries helpers
// ---------------------------------------------------------------------------

/** Get a reference to the raffle_entries database. */
export const getRaffleDb = (): nano.DocumentScope<any> => {
  return couch.use('raffle_entries')
}

/**
 * Check if a public address already exists for the given campaign.
 * Throws if a duplicate is found.
 */
export const checkDuplicates = async (
  db: nano.DocumentScope<any>,
  publicAddress: string,
  campaignId: string
): Promise<void> => {
  const addressResult = await db.find({
    selector: {
      campaignId,
      publicAddress
    },
    limit: 1,
    use_index: 'idx_address'
  })

  if (addressResult.docs.length > 0) {
    throw new Error('This address is already registered for the raffle')
  }
}

// ---------------------------------------------------------------------------
// raffle_campaigns helpers
// ---------------------------------------------------------------------------

/** Get a reference to the raffle_campaigns database. */
export const getCampaignsDb = (): nano.DocumentScope<any> => {
  return couch.use('raffle_campaigns')
}

/**
 * Look up a raffle campaign by its document ID.
 * Returns the campaign or null if not found.
 */
export const getCampaignById = async (
  campaignId: string
): Promise<RaffleCampaign | null> => {
  const db = getCampaignsDb()
  try {
    const doc = await db.get(campaignId)
    return asRaffleCampaign(doc)
  } catch (error: any) {
    if (error.statusCode === 404) return null
    throw error
  }
}
