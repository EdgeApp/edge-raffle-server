import {
  asArray,
  asBoolean,
  asEither,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue
} from 'cleaners'

// ---------- Email Validation ----------

const EMAIL_REGEX = /^[^\s@%=]+@[^\s@]+\.[^\s@]+$/

export const validateEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email)
}

// ---------- Email Normalization ----------

export const normalizeEmail = (email: string): string => {
  const lower = email.toLowerCase()
  const [localPart, domain] = lower.split('@')
  // Strip everything from '+' onward in the local part
  const base = localPart.split('+')[0]
  // Strip dots from the local part
  const noDots = base.replace(/\./g, '')
  return `${noDots}@${domain}`
}

// ---------- Data Param Handling ----------

export const asDecodedRewardsData = asObject({
  walletAddress: asString,
  ticker: asString
})

export type DecodedRewardsData = ReturnType<typeof asDecodedRewardsData>

export const decodeRewardsData = (data: string): DecodedRewardsData => {
  let decoded: string
  try {
    decoded = atob(data).trim()
  } catch {
    throw new Error('Invalid data parameter: failed to decode base64')
  }

  const parts = decoded.split('|')
  if (parts.length !== 3) {
    throw new Error('Invalid data parameter: expected 3 pipe-delimited fields')
  }

  const [prefix, walletAddress, ticker] = parts

  if (prefix !== 'edgerewards') {
    throw new Error('Invalid data parameter: missing edgerewards prefix')
  }

  if (walletAddress === '') {
    throw new Error('Invalid data parameter: wallet address is empty')
  }

  if (ticker === '') {
    throw new Error('Invalid data parameter: ticker is empty')
  }

  return { walletAddress, ticker: ticker.toLowerCase() }
}

// ---------- Database Document Cleaners ----------

export const asRewardCampaign = asObject({
  _id: asString,
  _rev: asOptional(asString),
  currencyPluginId: asString,
  ticker: asString,
  usdAmount: asString,
  active: asBoolean,
  description: asString,
  currencyDisplayName: asString
})

export type RewardCampaign = ReturnType<typeof asRewardCampaign>

export const asVerificationStatus = asValue(
  'created',
  'emailSent',
  'verified',
  'paymentSent'
)

export type VerificationStatus = ReturnType<typeof asVerificationStatus>

export const asRewardVerification = asObject({
  _id: asString,
  _rev: asOptional(asString),
  campaignId: asString,
  status: asVerificationStatus,
  email: asString,
  normalizedEmail: asString,
  walletAddress: asString,
  ticker: asString,
  usdAmount: asString,
  cryptoAmount: asEither(asString, asNull),
  exchangeRate: asEither(asString, asNull),
  verificationToken: asString,
  verificationCode: asString,
  createdAt: asString,
  expiresAt: asString,
  payoutId: asEither(asString, asNull),
  payoutStatus: asEither(asString, asNull)
})

export type RewardVerification = ReturnType<typeof asRewardVerification>

// ---------- API Request Cleaners (server-side validation) ----------

export const asValidateCaptchaRequest = asObject({
  captchaToken: asString
})

export type ValidateCaptchaRequest = ReturnType<typeof asValidateCaptchaRequest>

export const asValidateCaptchaResponse = asObject({
  success: asBoolean,
  sessionToken: asString
})

export type ValidateCaptchaResponse = ReturnType<
  typeof asValidateCaptchaResponse
>

export const asRewardsRegisterRequest = asObject({
  email: asString,
  data: asString,
  sessionToken: asString
})

export type RewardsRegisterRequest = ReturnType<typeof asRewardsRegisterRequest>

export const asRewardsVerifyCodeRequest = asObject({
  verificationId: asString,
  code: asString
})

export type RewardsVerifyCodeRequest = ReturnType<
  typeof asRewardsVerifyCodeRequest
>

// ---------- API Response Cleaners (client-side validation) ----------

export const asRegisterResponse = asObject({
  success: asBoolean,
  message: asString,
  verificationId: asString
})

export type RegisterResponse = ReturnType<typeof asRegisterResponse>

export const asVerifyCodeResponse = asObject({
  success: asBoolean,
  message: asString
})

export type VerifyCodeResponse = ReturnType<typeof asVerifyCodeResponse>

export const asErrorResponse = asObject({
  error: asString
})

export type ErrorResponse = ReturnType<typeof asErrorResponse>

// ---------- Client State Cleaners ----------

export const asVerifyCodeState = asObject({
  verificationId: asString,
  email: asString,
  walletAddress: asOptional(asString),
  usdAmount: asOptional(asString),
  currencyDisplayName: asOptional(asString)
})

export type VerifyCodeState = ReturnType<typeof asVerifyCodeState>

export const asRewardsSuccessState = asObject({
  walletAddress: asOptional(asString),
  usdAmount: asOptional(asString),
  currencyDisplayName: asOptional(asString)
})

export type RewardsSuccessState = ReturnType<typeof asRewardsSuccessState>

// ---------- Campaign Info API Response ----------

export const asCampaignInfoResponse = asObject({
  usdAmount: asString,
  currencyDisplayName: asString
})

export type CampaignInfoResponse = ReturnType<typeof asCampaignInfoResponse>

// ---------- Display Helpers ----------

export const truncateAddress = (address: string): string => {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}......${address.slice(-6)}`
}

// ---------- External API Cleaners ----------

export const asNowPaymentsAuthResponse = asObject({
  token: asString
})

export type NowPaymentsAuthResponse = ReturnType<
  typeof asNowPaymentsAuthResponse
>

const asNowPaymentsWithdrawal = asObject({
  id: asEither(asNumber, asString),
  address: asString,
  currency: asString,
  amount: asEither(asNumber, asString),
  status: asString
})

export const asNowPaymentsPayoutResponse = asObject({
  id: asString,
  withdrawals: asArray(asNowPaymentsWithdrawal)
})

export type NowPaymentsPayoutResponse = ReturnType<
  typeof asNowPaymentsPayoutResponse
>

export const asPayoutResult = asObject({
  payoutId: asString,
  status: asString
})

export type PayoutResult = ReturnType<typeof asPayoutResult>

// ---------- Rates API Cleaners ----------

const asRateEntry = asObject({
  asset: asObject({
    pluginId: asString,
    tokenId: asOptional(asEither(asString, asNull))
  }),
  rate: asOptional(asNumber)
})

export const asRatesResponse = asObject({
  crypto: asArray(asRateEntry)
})

export type RatesResponse = ReturnType<typeof asRatesResponse>

export const asExchangeRateResult = asObject({
  cryptoAmount: asString,
  exchangeRate: asString
})

export type ExchangeRateResult = ReturnType<typeof asExchangeRateResult>
