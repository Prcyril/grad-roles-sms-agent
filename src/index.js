import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'
import { healthRouter } from './routes/health.js'
import { digestRouter } from './routes/digest.js'
import { smsRouter } from './routes/sms.js'
import { runWeeklyDigest } from './services/digestService.js'
import { runDeadlineScan } from './services/deadlineService.js'

const app = express()
const PORT = process.env.PORT || 3000

// ── Middleware ────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: false })) // Twilio sends urlencoded

// ── Routes ────────────────────────────────────────────────
app.use('/health',  healthRouter)
app.use('/digest',  digestRouter)
app.use('/sms',     smsRouter)

// ── 404 fallback ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[error]', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

// ── Cron jobs ─────────────────────────────────────────────
// Weekly digest — Monday 9am AEST (Sun 23:00 UTC)
const weeklyCron = process.env.CRON_WEEKLY_DIGEST || '0 23 * * 0'
cron.schedule(weeklyCron, async () => {
  console.log('[cron] Weekly digest starting...')
  try {
    await runWeeklyDigest()
    console.log('[cron] Weekly digest complete')
  } catch (err) {
    console.error('[cron] Weekly digest failed:', err.message)
  }
}, { timezone: 'UTC' })

// Deadline scan — daily 8am AEST (22:00 UTC)
const deadlineCron = process.env.CRON_DEADLINE_SCAN || '0 22 * * *'
cron.schedule(deadlineCron, async () => {
  console.log('[cron] Deadline scan starting...')
  try {
    await runDeadlineScan()
    console.log('[cron] Deadline scan complete')
  } catch (err) {
    console.error('[cron] Deadline scan failed:', err.message)
  }
}, { timezone: 'UTC' })

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[jobagent] Server running on port ${PORT}`)
  console.log(`[jobagent] Weekly digest cron: ${weeklyCron} UTC`)
  console.log(`[jobagent] Deadline scan cron: ${deadlineCron} UTC`)
  console.log(`[jobagent] ENV: ${process.env.NODE_ENV}`)
})

export default app
