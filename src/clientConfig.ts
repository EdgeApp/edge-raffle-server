import { asNumber, asObject, asOptional, asString } from 'cleaners'
import clientConfigJson from '../clientConfig.json'

const asClientConfig = asObject({
  appPort: asOptional(asNumber, 8008),
  prosopoSiteKey: asOptional(asString, '')
}).withRest

export const clientConfig = asClientConfig(clientConfigJson)
