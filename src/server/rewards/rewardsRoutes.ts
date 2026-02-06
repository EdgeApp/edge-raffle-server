import { Router } from 'express'

import {
  type RewardVerification,
  asRewardsRegisterRequest,
  asRewardsVerifyCodeRequest,
  asValidateCaptchaRequest,
  decodeRewardsData,
  normalizeEmail,
  validateEmail
} from '../../common/rewardsTypes'
import { validateCaptchaToken } from '../shared/captchaService'
import { sendVerificationEmail } from './emailService'
import { sendPayout } from './nowPaymentsService'
import { fetchExchangeRate } from './ratesService'
import {
  consumeCaptchaSession,
  createCaptchaSession,
  createVerification,
  deleteVerification,
  findActiveCampaignByTicker,
  findByVerificationToken,
  findExistingByCampaignAndEmail,
  findPaidByAddress,
  findPaidByEmail,
  getCampaignById,
  getVerificationById,
  updateVerification
} from './rewardsDatabase'

export const rewardsRouter = Router()

// ---------- Logging ----------

const log = (...args: any[]): void => {
  console.log(new Date().toISOString(), ...args)
}

const logError = (...args: any[]): void => {
  console.error(new Date().toISOString(), ...args)
}

// ---------- Helpers ----------

/**
 * Process payout for a verified record. Shared between Method A and
 * Method B.
 *
 * 1. Set status to "verified"
 * 2. Look up the campaign for currencyPluginId
 * 3. Fetch exchange rate, convert USD to crypto
 * 4. Send payout via NOWPayments
 * 5. On success set status to "paymentSent"; on failure status stays
 *    "verified" for manual resolution
 */
const processPayout = async (
  doc: RewardVerification
): Promise<{ success: boolean; message: string }> => {
  // Mark as verified
  doc.status = 'verified'
  await updateVerification(doc)

  // Look up campaign for currencyPluginId
  const campaign = await getCampaignById(doc.campaignId)
  if (campaign == null) {
    logError(`Campaign not found: ${doc.campaignId}`)
    return {
      success: true,
      message: 'Email verified, but reward processing is delayed.'
    }
  }

  // Fetch exchange rate and convert USD to crypto
  try {
    const { cryptoAmount, exchangeRate } = await fetchExchangeRate(
      campaign.currencyPluginId,
      doc.usdAmount
    )
    doc.cryptoAmount = cryptoAmount
    doc.exchangeRate = exchangeRate
    await updateVerification(doc)
  } catch (error: any) {
    logError('Rate lookup failed:', error.message)
    doc.payoutStatus = 'rate_lookup_failed'
    await updateVerification(doc)
    return {
      success: true,
      message: 'Email verified, but reward processing is delayed.'
    }
  }

  // Send payout
  try {
    const result = await sendPayout({
      address: doc.walletAddress,
      currency: doc.ticker,
      amount: doc.cryptoAmount as string
    })
    doc.payoutId = result.payoutId
    doc.payoutStatus = result.status
    doc.status = 'paymentSent'
    await updateVerification(doc)
    return { success: true, message: 'Email verified, reward is being sent' }
  } catch (error: any) {
    logError('Payout failed:', error.message)
    doc.payoutStatus = 'failed'
    await updateVerification(doc)
    return {
      success: true,
      message:
        'Email verified, but reward processing is delayed. Please check back later.'
    }
  }
}

/**
 * Build the base URL from the request for use in verification links.
 */
const getBaseUrl = (req: any): string => {
  const protocol = req.get('x-forwarded-proto') ?? req.protocol
  const host = req.get('x-forwarded-host') ?? req.get('host') ?? 'localhost'
  return `${protocol}://${host}`
}

// ---------- POST /api/rewards/validate-captcha ----------

rewardsRouter.post('/api/rewards/validate-captcha', async (req, res) => {
  log('Serving rewards/validate-captcha')
  try {
    let body
    try {
      body = asValidateCaptchaRequest(req.body)
    } catch {
      return res
        .status(400)
        .json({ error: 'Invalid request body: captchaToken is required' })
    }

    log('Validating captcha token')
    const isValid = await validateCaptchaToken(body.captchaToken)
    log('Captcha validation complete')

    if (!isValid) {
      return res.status(403).json({ error: 'CAPTCHA validation failed' })
    }

    const sessionToken = await createCaptchaSession()
    log('Captcha session token created')
    return res.json({ success: true, sessionToken })
  } catch (error: any) {
    logError('Error in rewards/validate-captcha:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------- GET /api/rewards/campaign-info ----------

rewardsRouter.get('/api/rewards/campaign-info', async (req, res) => {
  try {
    const ticker = req.query.ticker as string

    if (ticker == null || ticker === '') {
      return res.status(400).json({ error: 'Missing ticker parameter' })
    }

    const campaign = await findActiveCampaignByTicker(ticker.toLowerCase())
    if (campaign == null) {
      return res
        .status(404)
        .json({ error: 'No active campaign found for this currency' })
    }

    return res.json({
      usdAmount: campaign.usdAmount,
      currencyDisplayName: campaign.currencyDisplayName
    })
  } catch (error: any) {
    logError('Error in rewards/campaign-info:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------- POST /api/rewards/register ----------

rewardsRouter.post('/api/rewards/register', async (req, res) => {
  log('Serving rewards/register')
  try {
    // Parse and validate request body
    let body
    try {
      body = asRewardsRegisterRequest(req.body)
    } catch (err) {
      log('Register request body parse failed:', String(err))
      return res.status(400).json({
        error:
          'Invalid request body: email, data, and sessionToken are required'
      })
    }

    const { email, data, sessionToken } = body

    // 1. Validate captcha session token
    log('Consuming captcha session token')
    const isValidSession = await consumeCaptchaSession(sessionToken)
    if (!isValidSession) {
      log('Session token invalid or expired')
      return res
        .status(403)
        .json({ error: 'Invalid or expired session. Please try again.' })
    }
    log('Session token valid')

    // 2. Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // 3. Compute normalized email
    const normalizedEmailValue = normalizeEmail(email)

    // 4. Decode and validate data param (ticker normalized to lowercase)
    let walletAddress: string
    let ticker: string
    try {
      const decoded = decodeRewardsData(data)
      walletAddress = decoded.walletAddress
      ticker = decoded.ticker
    } catch (error: any) {
      return res.status(400).json({ error: error.message })
    }

    // 5. Global duplicate check: email
    log('Checking email duplicate')
    const emailDuplicate = await findPaidByEmail(normalizedEmailValue)
    log('Email duplicate check complete')

    if (emailDuplicate) {
      return res.status(409).json({
        error: 'This email has already been used to claim a reward'
      })
    }

    // 6. Global duplicate check: address
    log('Checking address duplicate')
    const addressDuplicate = await findPaidByAddress(walletAddress)
    log('Address duplicate check complete')

    if (addressDuplicate) {
      return res.status(409).json({
        error: 'This wallet address has already been used to claim a reward'
      })
    }

    // 7. Look up active campaign (ticker is lowercase in DB)
    log('Looking up campaign for ticker:', ticker)
    const campaign = await findActiveCampaignByTicker(ticker)
    log('Campaign lookup complete')

    if (campaign == null) {
      return res
        .status(404)
        .json({ error: 'No active campaign found for this currency' })
    }

    // 8. Per-campaign duplicate check: only block if payment is in progress or sent
    log('Checking per-campaign duplicate')
    const existingEntry = await findExistingByCampaignAndEmail(
      campaign._id,
      normalizedEmailValue
    )
    log('Per-campaign duplicate check complete')

    if (existingEntry != null) {
      if (
        existingEntry.status === 'verified' ||
        existingEntry.status === 'paymentSent'
      ) {
        return res.status(409).json({
          error: 'This email is already registered for this campaign'
        })
      }
      // Stale record (created or emailSent) — remove it so the user can retry
      log('Deleting stale record')
      await deleteVerification(existingEntry)
      log('Stale record deleted')
    }

    // 9. Create verification record (status: "created")
    log('Creating verification record')
    const verification = await createVerification({
      campaignId: campaign._id,
      email,
      normalizedEmail: normalizedEmailValue,
      walletAddress,
      ticker,
      usdAmount: campaign.usdAmount
    })
    log('Verification record created')

    // 10. Send verification email; on success update status to "emailSent"
    const baseUrl = getBaseUrl(req)
    try {
      log('Sending verification email to', email)
      await sendVerificationEmail({
        to: email,
        verificationCode: verification.verificationCode,
        verificationToken: verification.verificationToken,
        baseUrl
      })
      log('Verification email sent to', email)
      verification.status = 'emailSent'
      await updateVerification(verification)
    } catch (error: any) {
      logError('Failed to send verification email:', error.message)
      return res
        .status(500)
        .json({ error: 'Failed to send verification email' })
    }

    log('Register complete for', email)
    return res.json({
      success: true,
      message: 'Verification email sent',
      verificationId: verification._id
    })
  } catch (error: any) {
    logError('Error in rewards/register:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------- POST /api/rewards/verify-code ----------

rewardsRouter.post('/api/rewards/verify-code', async (req, res) => {
  log('Serving rewards/verify-code')
  try {
    // Parse request body
    let body
    try {
      body = asRewardsVerifyCodeRequest(req.body)
    } catch {
      return res.status(400).json({
        error: 'Invalid request body: verificationId and code are required'
      })
    }

    const { verificationId, code } = body

    // Validate code format
    if (!/^\d{4}$/.test(code)) {
      return res
        .status(400)
        .json({ error: 'Invalid code format: must be 4 digits' })
    }

    // 1. Look up record
    const doc = await getVerificationById(verificationId)
    if (doc == null) {
      return res.status(404).json({ error: 'Verification record not found' })
    }

    // 2. Check status is "emailSent"
    if (doc.status !== 'emailSent') {
      return res.status(409).json({
        error:
          doc.status === 'paymentSent'
            ? 'Reward has already been sent'
            : 'Already verified'
      })
    }

    // 3. Check code matches
    if (doc.verificationCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code' })
    }

    // 4. Check expiration
    if (new Date() > new Date(doc.expiresAt)) {
      return res.status(410).json({
        error: 'Verification code has expired. Please register again.'
      })
    }

    // 5. Process payout (sets verified -> paymentSent)
    const payoutResult = await processPayout(doc)

    return res.json({
      success: payoutResult.success,
      message: payoutResult.message
    })
  } catch (error: any) {
    logError('Error in rewards/verify-code:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------- GET /api/rewards/verify ----------

rewardsRouter.get('/api/rewards/verify', async (req, res) => {
  log('Serving rewards/verify (email link)')
  try {
    const token = req.query.token as string

    if (token == null || token === '') {
      return res.status(400).send(renderErrorPage('Missing verification token'))
    }

    // 1. Look up record by token
    const doc = await findByVerificationToken(token)
    if (doc == null) {
      return res
        .status(404)
        .send(renderErrorPage('Verification token not found'))
    }

    // 2. Check status is "emailSent"
    if (doc.status !== 'emailSent') {
      return res
        .status(409)
        .send(
          renderErrorPage(
            doc.status === 'paymentSent'
              ? 'Reward has already been sent'
              : 'This email has already been verified'
          )
        )
    }

    // 3. Check expiration
    if (new Date() > new Date(doc.expiresAt)) {
      return res
        .status(410)
        .send(
          renderErrorPage(
            'This verification link has expired. Please register again.'
          )
        )
    }

    // 4. Process payout (sets verified -> paymentSent)
    const payoutResult = await processPayout(doc)

    return res.send(renderThankYouPage(payoutResult.message))
  } catch (error: any) {
    logError('Error in rewards/verify:', error)
    return res.status(500).send(renderErrorPage('An unexpected error occurred'))
  }
})

// ---------- Server-side HTML rendering ----------

const EDGE_LOGO_URL =
  'https://raw.githubusercontent.com/EdgeApp/edge-brand-guide/refs/heads/master/Logo/Primary/Edge_Primary_Logo_MintWhite.png'

const renderThankYouPage = (message: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edge Rewards - Verified</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { display: flex; flex-direction: column; min-height: 100vh; background: #f5f7fa; }
    .header { background-color: #0c2550; padding: 1.5rem; display: flex; justify-content: center; }
    .header img { height: 45px; }
    .container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; max-width: 500px; margin: 0 auto; padding: 40px 20px; }
    .checkmark { font-size: 64px; margin-bottom: 20px; }
    h1 { color: #28a745; margin-bottom: 16px; font-size: 24px; }
    p { color: #333; font-size: 16px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="header"><img src="${EDGE_LOGO_URL}" alt="Edge" /></div>
  <div class="container">
    <div class="checkmark">&#x2705;</div>
    <h1>Thank You!</h1>
    <p>${message}</p>
  </div>
</body>
</html>`

const renderErrorPage = (message: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edge Rewards - Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { display: flex; flex-direction: column; min-height: 100vh; background: #f5f7fa; }
    .header { background-color: #0c2550; padding: 1.5rem; display: flex; justify-content: center; }
    .header img { height: 45px; }
    .container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; max-width: 500px; margin: 0 auto; padding: 40px 20px; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { color: #dc3545; margin-bottom: 16px; font-size: 24px; }
    p { color: #333; font-size: 16px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="header"><img src="${EDGE_LOGO_URL}" alt="Edge" /></div>
  <div class="container">
    <div class="icon">&#x26A0;&#xFE0F;</div>
    <h1>Error</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
