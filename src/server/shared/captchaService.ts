import { config } from '../../config'

/**
 * Validate a Prosopo CAPTCHA token against the Prosopo API.
 * Returns true if the token is valid, false otherwise.
 */
export const validateCaptchaToken = async (token: string): Promise<boolean> => {
  console.log('Validating captcha token')
  try {
    const response = await fetch('https://api.prosopo.io/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        secret: config.prosopoApiKey
      })
    })

    if (!response.ok) {
      const text = await response.text()
      const errorString = `validateCaptchaToken failure response: ${response.status}: ${text}`
      console.log(errorString)
      throw new Error(errorString)
    }

    const data = await response.json()
    console.log('validateCaptchaToken data:', JSON.stringify(data, null, 2))
    return data.status === 'ok' && data.verified === true
  } catch (error: any) {
    console.log('Error validating captcha:', error.message)
    return false
  }
}
