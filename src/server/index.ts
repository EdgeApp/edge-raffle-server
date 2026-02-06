import cors from 'cors'
import express from 'express'
import path from 'path'

import { clientConfig } from '../clientConfig'
import { initRaffleDatabase } from './raffle/raffleDatabase'
import { raffleRouter } from './raffle/raffleRoutes'
import { initRewardsDatabase } from './rewards/rewardsDatabase'
import { rewardsRouter } from './rewards/rewardsRoutes'

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Initialize databases
initRaffleDatabase()
initRewardsDatabase()

// Mount route modules
app.use(raffleRouter)
app.use(rewardsRouter)

// Serve static client assets
app.use(express.static(path.join(__dirname, '../../dist')))

// Handle client-side routing (SPA fallback)
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'))
})

app.listen(clientConfig.appPort, () => {
  console.log(`Server running at http://localhost:${clientConfig.appPort}`)
})
