import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import {
  type VerifyCodeState,
  asErrorResponse,
  asVerifyCodeState
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
  margin-bottom: 12px;
  font-size: 24px;
`

const Subtitle = styled.p`
  text-align: center;
  margin-bottom: 24px;
  color: #666;
  font-size: 14px;
  max-width: 400px;
  line-height: 1.5;
`

const EmailHighlight = styled.span`
  font-weight: bold;
  color: #333;
`

const CodeInput = styled.input`
  width: 160px;
  padding: 16px;
  margin: 10px 0;
  border: 2px solid #ccc;
  border-radius: 8px;
  font-size: 32px;
  text-align: center;
  letter-spacing: 12px;
  font-family: monospace;

  &:focus {
    border-color: #0066cc;
    outline: none;
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

const HintText = styled.p`
  margin-top: 24px;
  color: #999;
  font-size: 13px;
  text-align: center;
  max-width: 300px;
  line-height: 1.4;
`

const ErrorMessage = styled.div`
  color: #dc3545;
  margin-top: 10px;
  text-align: center;
  font-weight: bold;
`

export const VerifyCode = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clean the router state with a cleaner
  let state: VerifyCodeState | null = null
  try {
    if (location.state != null) {
      state = asVerifyCodeState(location.state)
    }
  } catch {}

  if (state == null) {
    return (
      <Container>
        <ErrorMessage>
          Invalid verification session. Please start over.
        </ErrorMessage>
      </Container>
    )
  }

  const {
    verificationId,
    email,
    walletAddress,
    usdAmount,
    currencyDisplayName
  } = state
  const isCodeValid = /^\d{4}$/.test(code)

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4)
    setCode(value)
  }

  const handleSubmit = async () => {
    if (!isCodeValid) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/rewards/verify-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verificationId, code })
        }
      )

      if (!response.ok) {
        let errorMessage = 'Verification failed'
        try {
          const errorData = asErrorResponse(await response.json())
          errorMessage = errorData.error
        } catch {}
        throw new Error(errorMessage)
      }

      navigate('/rewards/success', {
        state: { walletAddress, usdAmount, currencyDisplayName }
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Verification failed. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Container>
      <Title>Enter Verification Code</Title>
      <Subtitle>
        We sent a verification code to <EmailHighlight>{email}</EmailHighlight>.
        Enter the 4-digit code below.
      </Subtitle>
      <CodeInput
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={handleCodeChange}
        placeholder="0000"
        disabled={isSubmitting}
        maxLength={4}
      />
      <Button onClick={handleSubmit} disabled={isSubmitting || !isCodeValid}>
        {isSubmitting ? 'Verifying...' : 'Verify'}
      </Button>
      {error != null && <SubmitError>{error}</SubmitError>}
      <HintText>
        You can also click the verification link in your email. The code and
        link expire in 10 minutes.
      </HintText>
    </Container>
  )
}
