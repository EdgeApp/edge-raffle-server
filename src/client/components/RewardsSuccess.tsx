import { useLocation } from 'react-router-dom'
import styled from 'styled-components'

import {
  type RewardsSuccessState,
  asRewardsSuccessState,
  truncateAddress
} from '../../common/rewardsTypes'

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 20px;
`

const Checkmark = styled.div`
  font-size: 64px;
  margin-bottom: 20px;
`

const Title = styled.h1`
  color: #28a745;
  text-align: center;
  margin-bottom: 16px;
  font-size: 28px;
`

const Message = styled.p`
  color: #333;
  font-size: 16px;
  text-align: center;
  max-width: 500px;
  line-height: 1.6;
`

const AddressSection = styled.div`
  margin: 24px 0 0;
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

export const RewardsSuccess = () => {
  const location = useLocation()

  let successState: RewardsSuccessState | null = null
  try {
    if (location.state != null) {
      successState = asRewardsSuccessState(location.state)
    }
  } catch {}

  const showAddress =
    successState?.walletAddress != null &&
    successState?.usdAmount != null &&
    successState?.currencyDisplayName != null

  return (
    <Container>
      <Checkmark>&#x2705;</Checkmark>
      <Title>Thank You!</Title>
      <Message>
        Your email has been verified and your reward is being sent to your
        wallet. It may take a few minutes to arrive.
      </Message>
      {showAddress && successState != null && (
        <AddressSection>
          <AddressTitle>
            Sending ${successState.usdAmount} of{' '}
            {successState.currencyDisplayName} to address
          </AddressTitle>
          <AddressValue>
            {truncateAddress(successState.walletAddress as string)}
          </AddressValue>
        </AddressSection>
      )}
    </Container>
  )
}
