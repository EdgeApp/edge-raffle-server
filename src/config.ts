import { makeConfig } from 'cleaner-config'
import { asObject, asOptional, asString } from 'cleaners'

export const asConfig = asObject({
  couchDbFullpath: asOptional(asString, 'http://admin:admin@127.0.0.1:5984'),
  prosopoApiKey: asOptional(asString, ''),
  prosopoProviderUrl: asOptional(asString, 'https://demo-provider.prosopo.io'),
  sendgridApiKey: asOptional(asString, ''),
  emailFromAddress: asOptional(asString, ''),
  gmailAddress: asOptional(asString, ''),
  gmailAppPassword: asOptional(asString, ''),
  nowPaymentsApiKey: asOptional(asString, ''),
  nowPaymentsEmail: asOptional(asString, ''),
  nowPaymentsPassword: asOptional(asString, '')
}).withRest

export const config = makeConfig(asConfig, 'config.json')
