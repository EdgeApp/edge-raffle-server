import { asObject, asOptional, asString } from 'cleaners'

export const asClientConfig = asObject({
  prosopoSiteKey: asOptional(asString, '')
})
