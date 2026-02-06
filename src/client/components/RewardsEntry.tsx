import { ProcaptchaComponent } from '@prosopo/react-procaptcha-wrapper'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import { clientConfig } from '../../clientConfig'
import {
  type CampaignInfoResponse,
  asCampaignInfoResponse,
  asErrorResponse,
  asRegisterResponse,
  asValidateCaptchaResponse,
  decodeRewardsData,
  truncateAddress,
  validateEmail
} from '../../common/rewardsTypes'
import { getApiBaseUrl } from '../api/baseUrl'

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 20px;
`

const Title = styled.h1`
  text-align: center;
  margin-bottom: 20px;
  font-size: 24px;
`

const Subtitle = styled.p`
  text-align: center;
  margin-bottom: 20px;
  color: #666;
  font-size: 14px;
  max-width: 400px;
`

const Input = styled.input`
  width: 100%;
  max-width: 300px;
  padding: 12px;
  margin: 10px 0;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 16px;

  @media (max-width: 768px) {
    max-width: 250px;
  }
`

const Button = styled.button`
  background-color: #0066cc;
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  margin-top: 10px;

  &:hover {
    background-color: #0052a3;
  }

  &:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
`

const ErrorMessage = styled.div`
  color: #dc3545;
  margin-top: 10px;
  text-align: center;
  font-weight: bold;
`

const SubmitError = styled.div`
  color: #dc3545;
  margin-top: 16px;
  text-align: center;
  padding: 12px;
  background-color: #ffe6e6;
  border-radius: 8px;
  max-width: 300px;
  font-size: 14px;
`

const CaptchaContainer = styled.div`
  margin: 20px 0;
  width: 100%;
  display: flex;
  justify-content: center;
`

const AddressSection = styled.div`
  margin: 16px 0;
  text-align: center;
`

const AddressTitle = styled.div`
  font-size: 14px;
  color: #333;
  margin-bottom: 8px;
`

const AddressValue = styled.div`
  font-family: 'Courier New', Courier, monospace;
  background-color: #f5f5f5;
  padding: 10px 16px;
  border-radius: 4px;
  font-size: 16px;
  letter-spacing: 1px;
`

export const RewardsEntry = () => {
  const navigate = useNavigate()
  const [data, setData] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const captchaDisabled = clientConfig.prosopoSiteKey === ''
  const [sessionToken, setSessionToken] = useState<string | null>(
    captchaDisabled ? 'bypass' : null
  )
  const [isValidatingCaptcha, setIsValidatingCaptcha] = useState(false)
  const [invalidData, setInvalidData] = useState(false)
  const captchaRef = useRef<any>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [campaignInfo, setCampaignInfo] = useState<CampaignInfoResponse | null>(
    null
  )

  // On mount, read and hide the data query param, decode address, fetch campaign info
  useEffect(() => {
    const init = async (): Promise<void> => {
      const params = new URLSearchParams(window.location.search)
      const dataParam = params.get('data')
      if (dataParam == null || dataParam === '') {
        setInvalidData(true)
        return
      }

      setData(dataParam)
      window.history.replaceState({}, '', '/rewards')

      // Decode data param to extract wallet address and ticker for display
      let ticker: string
      try {
        const decoded = decodeRewardsData(dataParam)
        setWalletAddress(decoded.walletAddress)
        ticker = decoded.ticker
      } catch {
        // Decode failed; the server will validate on submit
        return
      }

      // Fetch campaign display info (non-critical for form functionality)
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/rewards/campaign-info?ticker=${ticker}`
        )
        if (response.ok) {
          const info = asCampaignInfoResponse(await response.json())
          setCampaignInfo(info)
        }
      } catch {
        // Non-critical: address display just won't show amount/currency
      }
    }

    void init()
  }, [])

  const isEmailValid = validateEmail(email)

  const handleSubmit = async () => {
    if (data == null || sessionToken == null || !isEmailValid) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/rewards/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, data, sessionToken })
      })

      if (!response.ok) {
        let errorMessage = 'Failed to register'
        try {
          const errorData = asErrorResponse(await response.json())
          errorMessage = errorData.error
        } catch {}
        throw new Error(errorMessage)
      }

      const result = asRegisterResponse(await response.json())
      navigate('/rewards/verify', {
        state: {
          verificationId: result.verificationId,
          email,
          walletAddress,
          usdAmount: campaignInfo?.usdAmount,
          currencyDisplayName: campaignInfo?.currencyDisplayName
        }
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to submit. Please try again.'
      )
      if (!captchaDisabled) {
        if (captchaRef.current) captchaRef.current.reset()
        setSessionToken(null)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCaptchaSuccess = async (captchaToken: string) => {
    console.log('captcha success, validating server-side')
    setIsValidatingCaptcha(true)
    setError(null)

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/rewards/validate-captcha`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captchaToken })
        }
      )

      if (!response.ok) {
        let errorMessage = 'CAPTCHA validation failed'
        try {
          const errorData = asErrorResponse(await response.json())
          errorMessage = errorData.error
        } catch {}
        throw new Error(errorMessage)
      }

      const result = asValidateCaptchaResponse(await response.json())
      setSessionToken(result.sessionToken)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'CAPTCHA validation failed. Please try again.'
      )
      if (captchaRef.current) captchaRef.current.reset()
    } finally {
      setIsValidatingCaptcha(false)
    }
  }
  const handleCaptchaError = () => {
    console.log('captcha error')
    setError('Error in captcha verification. Please try again.')
    if (!captchaDisabled) setSessionToken(null)
  }
  const handleCaptchaFailed = () => {
    console.log('captcha failed')
    setError('Failed captcha verification. Please try again.')
    if (!captchaDisabled) setSessionToken(null)
  }

  if (invalidData) {
    return (
      <Container>
        <ErrorMessage>Invalid URL: Missing reward data</ErrorMessage>
      </Container>
    )
  }

  if (data == null) {
    return (
      <Container>
        <Title>Loading...</Title>
      </Container>
    )
  }

  if (sessionToken == null) {
    return (
      <Container>
        <Title>Claim Your Reward</Title>
        <Subtitle>
          {isValidatingCaptcha
            ? 'Validating...'
            : 'Complete the captcha below to continue'}
        </Subtitle>
        {error != null && <SubmitError>{error}</SubmitError>}
        <CaptchaContainer>
          <ProcaptchaComponent
            siteKey={clientConfig.prosopoSiteKey}
            language={'en'}
            callback={handleCaptchaSuccess}
            error-callback={handleCaptchaError}
            failed-callback={handleCaptchaFailed}
            htmlAttributes={{
              className: 'my-app__procaptcha',
              style: { maxWidth: '600px' }
            }}
          />
        </CaptchaContainer>
      </Container>
    )
  }

  return (
    <Container>
      <Title>Enter your email to claim your reward</Title>
      <Subtitle>
        We will send you a verification code to confirm your email address.
      </Subtitle>
      {walletAddress != null && campaignInfo != null && (
        <AddressSection>
          <AddressTitle>
            Send ${campaignInfo.usdAmount} of {campaignInfo.currencyDisplayName}{' '}
            to address
          </AddressTitle>
          <AddressValue>{truncateAddress(walletAddress)}</AddressValue>
        </AddressSection>
      )}
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email address"
        disabled={isSubmitting}
      />
      <input type="hidden" name="data" value={data} />
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !isEmailValid || sessionToken == null}
      >
        {isSubmitting ? 'Submitting...' : 'Send Verification Code'}
      </Button>
      {error != null && <SubmitError>{error}</SubmitError>}
    </Container>
  )
}
