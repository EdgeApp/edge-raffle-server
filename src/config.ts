import { makeConfig } from 'cleaner-config'
import { asNumber, asObject, asOptional, asString } from 'cleaners'

export const asConfig = asObject({
  appPort: asOptional(asNumber, 8008),
  couchDbFullpath: asOptional(asString, 'http://admin:admin@127.0.0.1:5984'),
  raffleId: asOptional(asString, 'monerokon'),
  prosopoApiKey: asOptional(asString, ''),
  prosopoProviderUrl: asOptional(asString, 'https://demo-provider.prosopo.io')
})

export const config = makeConfig(asConfig, 'config.json')
