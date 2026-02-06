import crypto from 'crypto'
import {
  type DatabaseSetup,
  makeMangoIndex,
  setupDatabase
} from 'edge-server-tools'
import nano from 'nano'

import {
  RewardCampaign,
  RewardVerification,
  asRewardCampaign,
  asRewardVerification
} from '../../common/rewardsTypes'
import { config } from '../../config'

const couch = nano(config.couchDbFullpath)

const CAMPAIGNS_DB = 'rewards_campaigns'
const VERIFICATIONS_DB = 'rewards_verifications'
const CAPTCHA_SESSIONS_DB = 'rewards_captcha_sessions'

// ---------------------------------------------------------------------------
// Database setup definitions
// ---------------------------------------------------------------------------

const campaignsDatabaseSetup: DatabaseSetup = {
  name: CAMPAIGNS_DB,
  documents: {
    '_design/idx_ticker_active': makeMangoIndex(
      'idx_ticker_active',
      ['ticker', 'active'],
      { partitioned: false }
    )
  },
  // Templates are write-once: created if missing, never overwritten.
  templates: {
    'btc-launch-2026': {
      _id: 'btc-launch-2026',
      currencyPluginId: 'bitcoin',
      ticker: 'btc',
      usdAmount: '5.00',
      active: false,
      description: 'Sample BTC launch promotion (disabled)',
      currencyDisplayName: 'Bitcoin'
    }
  }
}

const verificationsDatabaseSetup: DatabaseSetup = {
  name: VERIFICATIONS_DB,
  documents: {
    // --- Mango indexes ---
    '_design/idx_normalizedEmail': makeMangoIndex(
      'idx_normalizedEmail',
      ['normalizedEmail', 'status'],
      { partitioned: false }
    ),
    '_design/idx_walletAddress': makeMangoIndex(
      'idx_walletAddress',
      ['walletAddress', 'status'],
      { partitioned: false }
    ),
    '_design/idx_verificationToken': makeMangoIndex(
      'idx_verificationToken',
      ['verificationToken'],
      { partitioned: false }
    ),
    '_design/idx_verificationCode': makeMangoIndex(
      'idx_verificationCode',
      ['_id', 'verificationCode'],
      { partitioned: false }
    ),
    '_design/idx_campaign_normalizedEmail': makeMangoIndex(
      'idx_campaign_normalizedEmail',
      ['campaignId', 'normalizedEmail'],
      { partitioned: false }
    )
  },
  // Templates are write-once: created if missing, never overwritten.
  templates: {
    // Terminal: payment sent
    'btc-launch-2026:1738780800000:sample01': {
      _id: 'btc-launch-2026:1738780800000:sample01',
      campaignId: 'btc-launch-2026',
      status: 'paymentSent',
      email: 'alice+promo@gmail.com',
      normalizedEmail: 'alice@gmail.com',
      walletAddress: 'bc1qexamplealice000000000000000000000000',
      ticker: 'btc',
      usdAmount: '5.00',
      cryptoAmount: '0.00005128',
      exchangeRate: '97500.12',
      verificationToken: 'sampletokenaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      verificationCode: '1234',
      createdAt: '2026-02-05T12:00:00.000Z',
      expiresAt: '2026-02-05T12:10:00.000Z',
      payoutId: 'np-sample-001',
      payoutStatus: 'finished'
    },

    // Stuck at verified: payout failed
    'btc-launch-2026:1738780860000:sample02': {
      _id: 'btc-launch-2026:1738780860000:sample02',
      campaignId: 'btc-launch-2026',
      status: 'verified',
      email: 'bob@example.com',
      normalizedEmail: 'bob@example.com',
      walletAddress: 'bc1qexamplebob00000000000000000000000000',
      ticker: 'btc',
      usdAmount: '5.00',
      cryptoAmount: '0.00005128',
      exchangeRate: '97500.12',
      verificationToken: 'sampletokenbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      verificationCode: '5678',
      createdAt: '2026-02-05T12:01:00.000Z',
      expiresAt: '2026-02-05T12:11:00.000Z',
      payoutId: null,
      payoutStatus: 'failed'
    },

    // Awaiting verification (dot normalization demo)
    'btc-launch-2026:1738780920000:sample03': {
      _id: 'btc-launch-2026:1738780920000:sample03',
      campaignId: 'btc-launch-2026',
      status: 'emailSent',
      email: 'c.a.r.o.l@gmail.com',
      normalizedEmail: 'carol@gmail.com',
      walletAddress: 'bc1qexamplecarol0000000000000000000000000',
      ticker: 'btc',
      usdAmount: '5.00',
      cryptoAmount: null,
      exchangeRate: null,
      verificationToken: 'sampletokencccccccccccccccccccccccccccccc',
      verificationCode: '9012',
      createdAt: '2026-02-05T12:02:00.000Z',
      expiresAt: '2026-02-05T12:12:00.000Z',
      payoutId: null,
      payoutStatus: null
    }
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the rewards databases, indexes, and sample data using
 * edge-server-tools.
 */
const captchaSessionsDatabaseSetup: DatabaseSetup = {
  name: CAPTCHA_SESSIONS_DB
}

export const initRewardsDatabase = async (): Promise<void> => {
  await setupDatabase(config.couchDbFullpath, campaignsDatabaseSetup)
  await setupDatabase(config.couchDbFullpath, verificationsDatabaseSetup)
  await setupDatabase(config.couchDbFullpath, captchaSessionsDatabaseSetup)
}

// ---------------------------------------------------------------------------
// Database accessors
// ---------------------------------------------------------------------------

const getCampaignsDb = (): nano.DocumentScope<any> => {
  return couch.use(CAMPAIGNS_DB)
}

const getVerificationsDb = (): nano.DocumentScope<any> => {
  return couch.use(VERIFICATIONS_DB)
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Find an active campaign matching the given ticker (lowercase).
 */
export const findActiveCampaignByTicker = async (
  ticker: string
): Promise<RewardCampaign | null> => {
  const db = getCampaignsDb()
  const result = await db.find({
    selector: { ticker: ticker.toLowerCase(), active: true },
    limit: 1,
    use_index: 'idx_ticker_active'
  })
  return result.docs.length > 0 ? asRewardCampaign(result.docs[0]) : null
}

/**
 * Get a campaign by its _id.
 */
export const getCampaignById = async (
  id: string
): Promise<RewardCampaign | null> => {
  const db = getCampaignsDb()
  try {
    return asRewardCampaign(await db.get(id))
  } catch (error: any) {
    if (error.statusCode === 404) return null
    throw error
  }
}

/**
 * Check if a normalizedEmail already has a paymentSent record across
 * all campaigns.
 */
export const findPaidByEmail = async (
  normalizedEmail: string
): Promise<boolean> => {
  const db = getVerificationsDb()
  const result = await db.find({
    selector: { normalizedEmail, status: 'paymentSent' },
    limit: 1,
    use_index: 'idx_normalizedEmail'
  })
  return result.docs.length > 0
}

/**
 * Check if a wallet address already has a paymentSent record across
 * all campaigns.
 */
export const findPaidByAddress = async (
  walletAddress: string
): Promise<boolean> => {
  const db = getVerificationsDb()
  const result = await db.find({
    selector: { walletAddress, status: 'paymentSent' },
    limit: 1,
    use_index: 'idx_walletAddress'
  })
  return result.docs.length > 0
}

/**
 * Find an existing verification entry for a normalizedEmail within a
 * campaign.  Returns the full document so callers can inspect status.
 */
export const findExistingByCampaignAndEmail = async (
  campaignId: string,
  normalizedEmail: string
): Promise<RewardVerification | null> => {
  const db = getVerificationsDb()
  const result = await db.find({
    selector: { campaignId, normalizedEmail },
    limit: 1,
    use_index: 'idx_campaign_normalizedEmail'
  })
  return result.docs.length > 0 ? asRewardVerification(result.docs[0]) : null
}

/**
 * Delete a verification record by its document.
 */
export const deleteVerification = async (
  doc: RewardVerification
): Promise<void> => {
  const db = getVerificationsDb()
  await db.destroy(doc._id, doc._rev as string)
}

/**
 * Find a verification record by its verificationToken (for email link).
 */
export const findByVerificationToken = async (
  token: string
): Promise<RewardVerification | null> => {
  const db = getVerificationsDb()
  const result = await db.find({
    selector: { verificationToken: token },
    limit: 1,
    use_index: 'idx_verificationToken'
  })
  return result.docs.length > 0 ? asRewardVerification(result.docs[0]) : null
}

/**
 * Get a verification record by its _id (for code verification).
 */
export const getVerificationById = async (
  id: string
): Promise<RewardVerification | null> => {
  const db = getVerificationsDb()
  try {
    return asRewardVerification(await db.get(id))
  } catch (error: any) {
    if (error.statusCode === 404) return null
    throw error
  }
}

/**
 * Create a new verification record with status "created".
 */
export const createVerification = async (params: {
  campaignId: string
  email: string
  normalizedEmail: string
  walletAddress: string
  ticker: string
  usdAmount: string
}): Promise<RewardVerification> => {
  const db = getVerificationsDb()

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000) // 10 minutes
  const random = crypto.randomBytes(6).toString('hex')
  const docId = `${params.campaignId}:${now.getTime()}:${random}`

  const verificationToken = crypto.randomBytes(32).toString('hex')
  const verificationCode = crypto
    .randomInt(0, 10000)
    .toString()
    .padStart(4, '0')

  const doc = {
    _id: docId,
    campaignId: params.campaignId,
    status: 'created',
    email: params.email,
    normalizedEmail: params.normalizedEmail,
    walletAddress: params.walletAddress,
    ticker: params.ticker,
    usdAmount: params.usdAmount,
    cryptoAmount: null,
    exchangeRate: null,
    verificationToken,
    verificationCode,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    payoutId: null,
    payoutStatus: null
  }

  const response = await db.insert(doc, docId)
  return asRewardVerification({ ...doc, _rev: response.rev })
}

/**
 * Update a verification record. Refreshes `_rev` on the passed object
 * so that sequential updates don't conflict.
 */
export const updateVerification = async (
  doc: RewardVerification
): Promise<void> => {
  const db = getVerificationsDb()
  const response = await db.insert(doc)
  doc._rev = response.rev
}

// ---------------------------------------------------------------------------
// Captcha session helpers
// ---------------------------------------------------------------------------

const CAPTCHA_SESSION_TTL_MS = 10 * 60 * 1000

const getCaptchaSessionsDb = (): nano.DocumentScope<any> => {
  return couch.use(CAPTCHA_SESSIONS_DB)
}

/**
 * Create a captcha session token in CouchDB. Returns the token string.
 */
export const createCaptchaSession = async (): Promise<string> => {
  const db = getCaptchaSessionsDb()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + CAPTCHA_SESSION_TTL_MS).toISOString()
  await db.insert({ _id: token, expiresAt })
  return token
}

/**
 * Consume a captcha session token. Returns true if valid and not expired,
 * false otherwise. The token is deleted on consumption (one-time use).
 */
export const consumeCaptchaSession = async (
  token: string
): Promise<boolean> => {
  const db = getCaptchaSessionsDb()
  try {
    const doc = await db.get(token)
    // Delete immediately (one-time use)
    await db.destroy(doc._id, doc._rev)
    // Check expiration
    if (new Date() > new Date(doc.expiresAt)) return false
    return true
  } catch (error: any) {
    if (error.statusCode === 404) return false
    throw error
  }
}
