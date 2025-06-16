// Get the base URL for API calls
import { clientConfig } from '../../clientConfig'

export const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${clientConfig.appPort}`
  }
  // In production, use relative URLs
  return ''
}
