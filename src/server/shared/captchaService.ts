import { config } from '../../config'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Single attempt to validate a token against Prosopo siteverify API.
 * Returns { verified, retryable } where retryable indicates a 5xx error
 * that may succeed on retry.
 */
const attemptValidation = async (
  token: string
): Promise<{ verified: boolean; retryable: boolean }> => {
  const response = await fetch('https://api.prosopo.io/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, secret: config.prosopoApiKey })
  })

  if (!response.ok) {
    const text = await response.text()
    const retryable = response.status >= 500
    return { verified: false, retryable }
  }

  const data = await response.json()
  const verified = data.status === 'ok' && data.verified === true
  const ts = new Date().toISOString()
  console.log(
    ts,
    `Captcha siteverify result: verified=${verified}, score=${data.score}, status=${data.status}`
  )
  return { verified, retryable: false }
}

/**
 * Validate a Prosopo CAPTCHA token against the Prosopo API.
 * Retries up to MAX_RETRIES times on 5xx server errors.
 * Returns true if the token is valid, false otherwise.
 */
export const validateCaptchaToken = async (token: string): Promise<boolean> => {
  const ts = () => new Date().toISOString()

  if (config.prosopoApiKey === '') {
    console.log(ts(), 'Skipping captcha validation (no prosopoApiKey)')
    return true
  }

  console.log(ts(), `Validating captcha token (length: ${token.length})`)

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await attemptValidation(token)

      if (result.verified) {
        return true
      }

      if (!result.retryable || attempt === MAX_RETRIES) {
        console.log(
          ts(),
          `Captcha validation failed (attempt ${attempt}/${MAX_RETRIES}, retryable=${result.retryable})`
        )
        return false
      }

      console.log(
        ts(),
        `Captcha siteverify returned 5xx (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`
      )
      await sleep(RETRY_DELAY_MS)
    } catch (error: any) {
      console.log(
        ts(),
        `Captcha siteverify error (attempt ${attempt}/${MAX_RETRIES}):`,
        error.message
      )
      if (attempt === MAX_RETRIES) return false
      await sleep(RETRY_DELAY_MS)
    }
  }

  return false
}
