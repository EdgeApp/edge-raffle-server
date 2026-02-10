import {
  asArray,
  asEither,
  asNull,
  asNumber,
  asObject,
  asOptional,
  asString,
  asValue
} from 'cleaners'

// ---------------------------------------------------------------------------
// Raffle Campaign (CouchDB document in raffle_campaigns)
// ---------------------------------------------------------------------------

export type RaffleCampaignMode = 'email' | 'handle'

export const asRaffleCampaignMode = asValue('email', 'handle')

export const asRaffleCampaign = asObject({
  _id: asOptional(asString),
  _rev: asOptional(asString),
  title: asString,
  subtitle: asString,
  mode: asRaffleCampaignMode
})

export type RaffleCampaign = ReturnType<typeof asRaffleCampaign>

/** Client-safe campaign info returned by the API (no _rev). */
export const asRaffleCampaignInfo = asObject({
  _id: asOptional(asString),
  title: asString,
  subtitle: asString,
  mode: asRaffleCampaignMode
})

export type RaffleCampaignInfo = ReturnType<typeof asRaffleCampaignInfo>

// ---------------------------------------------------------------------------
// Raffle Entry (CouchDB document in raffle_entries)
// ---------------------------------------------------------------------------

export interface RaffleEntry {
  campaignId: string
  nameHandle: string
  emailAddress: string
  isoDate: string
  raffleId: string
  publicAddress: string
  _id?: string
  _rev?: string
}

// cleaner matching RaffleEntry but without _id and _rev
export const asRaffleEntry = asObject({
  campaignId: asOptional(asString, ''),
  nameHandle: asOptional(asString, ''),
  emailAddress: asOptional(asString, ''),
  isoDate: asString,
  raffleId: asString,
  publicAddress: asString
})

export const asRaffleEntries = asArray(asRaffleEntry)

export const asRaffleEntryRequest = asObject({
  campaignId: asString,
  nameHandle: asOptional(asString, ''),
  emailAddress: asOptional(asString, ''),
  publicAddress: asString,
  captchaToken: asString
})

export type RaffleEntryRequest = ReturnType<typeof asRaffleEntryRequest>

export const asAsset = asObject({
  chainPluginId: asString,
  chainName: asOptional(asString),
  tokenId: asEither(asString, asNull),
  currencyCode: asString,
  uriType: asValue('bip21', 'eip831', 'stellar'), // Note: This could be more strict with literal types
  uriProtocol: asString, // Value before the ":". ie "bitcoin", "ethereum", "litecoin", etc.
  uriEvmChainId: asOptional(asNumber),
  tokenNumDecimals: asOptional(asNumber),
  publicAddress: asString
})

export type Asset = ReturnType<typeof asAsset>

export interface AssetDoc extends Asset {
  _id: string
  _rev: string
}
