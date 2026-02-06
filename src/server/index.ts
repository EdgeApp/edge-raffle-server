import cors from 'cors'
import express from 'express'
import path from 'path'

import { clientConfig } from '../clientConfig'
import { initRaffleDatabase } from './raffle/raffleDatabase'
import { raffleRouter } from './raffle/raffleRoutes'

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Initialize databases
initRaffleDatabase()

// Mount route modules
app.use(raffleRouter)

// Serve static client assets
app.use(express.static(path.join(__dirname, '../../dist')))

// Handle client-side routing
app.get('/', (req, res) => {
  console.log('Serving index.html')
  res.sendFile(path.join(__dirname, '../../dist/index.html'))
})

app.listen(clientConfig.appPort, () => {
  console.log(`Server running at http://localhost:${clientConfig.appPort}`)
})
