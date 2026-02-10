import { ProcaptchaComponent } from '@prosopo/react-procaptcha-wrapper'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import styled from 'styled-components'

import { clientConfig } from '../../clientConfig'
import {
  type RaffleCampaignInfo,
  asRaffleCampaignInfo
} from '../../common/types'
import { getApiBaseUrl } from '../api/baseUrl'

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

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
    max-width: 150px;
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

const AddressSection = styled.div`
  margin: 20px 0;
  text-align: center;
  max-width: 300px;
  word-wrap: break-word;
`

const AddressLabel = styled.div`
  font-weight: bold;
  margin-bottom: 8px;
`

const AddressValue = styled.div`
  font-family: monospace;
  background-color: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
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

const SuccessMessage = styled.div`
  color: #28a745;
  font-size: 24px;
  text-align: center;
  max-width: 600px;
  line-height: 1.5;
  padding: 20px;
`

const CaptchaContainer = styled.div`
  margin: 20px 0;
  width: 100%;
  display: flex;
  justify-content: center;
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RaffleEntry = () => {
  const [searchParams] = useSearchParams()
  const publicAddress = searchParams.get('publicAddress')
  const campaignId = searchParams.get('campaign')

  // Campaign config fetched from CouchDB via the server
  const [campaign, setCampaign] = useState<RaffleCampaignInfo | null>(null)
  const [campaignError, setCampaignError] = useState<string | null>(null)

  // Form fields (used across both modes)
  const [nameHandle, setNameHandle] = useState('')
  const [emailAddress, setEmailAddress] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const captchaDisabled = clientConfig.prosopoSiteKey === ''
  const [captchaToken, setCaptchaToken] = useState<string | null>(
    captchaDisabled ? 'bypass' : null
  )
  const captchaRef = useRef<any>(null)

  // Fetch campaign config on mount
  useEffect(() => {
    if (campaignId == null || campaignId === '') {
      setCampaignError('Missing campaign parameter in URL')
      return
    }

    const fetchCampaign = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/campaign/${encodeURIComponent(campaignId)}`
        )
        if (!response.ok) {
          setCampaignError('Campaign not found')
          return
        }
        const data = asRaffleCampaignInfo(await response.json())
        setCampaign(data)
      } catch {
        setCampaignError('Failed to load campaign configuration')
      }
    }

    void fetchCampaign()
  }, [campaignId])

  // Derived validation based on campaign mode
  const isFormValid = (): boolean => {
    if (publicAddress == null || captchaToken == null) return false
    if (campaign == null) return false
    if (campaign.mode === 'email') {
      return nameHandle.trim() !== '' && emailAddress.trim() !== ''
    }
    // handle mode
    return nameHandle.trim() !== ''
  }

  const handleSubmit = async () => {
    if (!isFormValid() || campaignId == null) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/addEntry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          nameHandle,
          emailAddress: campaign?.mode === 'email' ? emailAddress : '',
          publicAddress,
          captchaToken
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText)
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to submit entry. Please try again.'
      )
      if (captchaRef.current) captchaRef.current.reset()
      setCaptchaToken(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCaptchaSuccess = (token: string) => {
    setCaptchaToken(token)
    setError(null)
  }
  const handleCaptchaError = () => {
    setError('Error in captcha verification. Please try again.')
    setCaptchaToken(null)
  }
  const handleCaptchaFailed = () => {
    setError('Failed captcha verification. Please try again.')
    setCaptchaToken(null)
  }

  // ---- Render states ----

  // Missing or invalid campaign
  if (campaignError != null) {
    return (
      <Container>
        <ErrorMessage>{campaignError}</ErrorMessage>
      </Container>
    )
  }

  // Still loading campaign config
  if (campaign == null) {
    return (
      <Container>
        <Title>Loading...</Title>
      </Container>
    )
  }

  // Missing public address
  if (publicAddress == null) {
    return (
      <Container>
        <ErrorMessage>Invalid URL: Missing Public Address</ErrorMessage>
      </Container>
    )
  }

  // Success
  if (isSubmitted) {
    return (
      <Container>
        <SuccessMessage>
          Entry submitted! Good luck and check in at the end of the conference
          for raffle winners.
        </SuccessMessage>
      </Container>
    )
  }

  // Captcha step
  if (captchaToken == null) {
    return (
      <Container>
        <Title>{campaign.title}</Title>
        <Subtitle>{campaign.subtitle}</Subtitle>
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

  // Entry form – mode-specific fields
  return (
    <Container>
      <Title>{campaign.title}</Title>
      <Subtitle>{campaign.subtitle}</Subtitle>

      {campaign.mode === 'email' ? (
        <>
          <Input
            type="text"
            value={nameHandle}
            onChange={(e) => setNameHandle(e.target.value)}
            placeholder="Enter your name"
            disabled={isSubmitting}
          />
          <Input
            type="email"
            value={emailAddress}
            onChange={(e) => setEmailAddress(e.target.value)}
            placeholder="Enter your email address"
            disabled={isSubmitting}
          />
        </>
      ) : (
        <Input
          type="text"
          value={nameHandle}
          onChange={(e) => setNameHandle(e.target.value)}
          placeholder="Enter your handle"
          disabled={isSubmitting}
        />
      )}

      <AddressSection>
        <AddressLabel>Your Public Address</AddressLabel>
        <AddressValue>{publicAddress}</AddressValue>
      </AddressSection>

      <Button onClick={handleSubmit} disabled={isSubmitting || !isFormValid()}>
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </Button>
      {error != null && <SubmitError>{error}</SubmitError>}
    </Container>
  )
}
