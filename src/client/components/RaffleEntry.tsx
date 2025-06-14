import { useState, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getApiBaseUrl } from '../api/baseUrl'
import { ProcaptchaComponent } from '@prosopo/react-procaptcha-wrapper'
import { asClientConfig } from '../../clientConfig'
import clientConfig from '../../../clientConfig.json'

const config = asClientConfig(clientConfig)
console.log('config', config)

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

export const RaffleEntry = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [nameHandle, setNameHandle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<any>(null)
  const publicAddress = searchParams.get('publicAddress')

  useEffect(() => {
    if (publicAddress == null) {
      navigate('/', { replace: true })
    }
  }, [publicAddress, navigate])

  const handleSubmit = async () => {
    if (
      nameHandle.trim() === '' ||
      publicAddress == null ||
      captchaToken == null
    )
      return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/addEntry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nameHandle,
          publicAddress,
          captchaToken
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText)
      }

      setIsSubmitted(true)
    } catch (error) {
      console.error('Error submitting entry:', error)
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to submit entry. Please try again.'
      )
      // Reset captcha on error
      if (captchaRef.current) {
        captchaRef.current.reset()
      }
      setCaptchaToken(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCaptchaSuccess = (token: string) => {
    console.log('captcha success', token)
    setCaptchaToken(token)
  }

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

  if (publicAddress == null) {
    return (
      <Container>
        <ErrorMessage>Invalid URL: Missing Monero address</ErrorMessage>
      </Container>
    )
  }

  return (
    <Container>
      <Title>Enter name or handle to register</Title>
      <Input
        type="text"
        value={nameHandle}
        onChange={(e) => setNameHandle(e.target.value)}
        placeholder="Enter your name or handle"
        disabled={isSubmitting}
      />
      <AddressSection>
        <AddressLabel>Your Monero Address</AddressLabel>
        <AddressValue>{publicAddress}</AddressValue>
      </AddressSection>
      <CaptchaContainer>
        <ProcaptchaComponent
          siteKey={config.prosopoSiteKey}
          language={'en'}
          callback={handleCaptchaSuccess}
          htmlAttributes={{
            className: 'my-app__procaptcha',
            style: {
              maxWidth: '600px'
            }
          }}
        />
      </CaptchaContainer>
      <Button
        onClick={handleSubmit}
        disabled={
          isSubmitting ||
          nameHandle.trim() === '' ||
          publicAddress == null ||
          captchaToken == null
        }
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </Button>
      {error != null && <SubmitError>{error}</SubmitError>}
    </Container>
  )
}
