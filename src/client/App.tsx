import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import styled, { createGlobalStyle } from 'styled-components'

import { Header } from './components/Header'
import { RaffleEntry } from './components/RaffleEntry'
import { RewardsEntry } from './components/RewardsEntry'
import { RewardsSuccess } from './components/RewardsSuccess'
import { VerifyCode } from './components/VerifyCode'

const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }

  body {
    margin: 0;
    padding: 0;
  }
`

const AppContainer = styled.div`
  height: 100vh;
  display: flex;
  flex-direction: column;
`

const App = () => {
  return (
    <Router>
      <GlobalStyle />
      <AppContainer>
        <Header />
        <Routes>
          <Route path="/" element={<RaffleEntry />} />
          <Route path="/rewards" element={<RewardsEntry />} />
          <Route path="/rewards/verify" element={<VerifyCode />} />
          <Route path="/rewards/success" element={<RewardsSuccess />} />
        </Routes>
      </AppContainer>
    </Router>
  )
}

export default App
