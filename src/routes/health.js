import { Router } from 'express'
import { supabase } from '../config/supabase.js'

export const healthRouter = Router()

healthRouter.get('/', async (req, res) => {
  const checks = {}

  // Check Supabase connectivity
  try {
    const { error } = await supabase.from('user_prefs').select('id').limit(1)
    checks.supabase = error ? { status: 'error', message: error.message } : { status: 'ok' }
  } catch (err) {
    checks.supabase = { status: 'error', message: err.message }
  }

  // Check env vars are set (not their values)
  checks.env = {
    anthropic:    !!process.env.ANTHROPIC_API_KEY,
    twilio_sid:   !!process.env.TWILIO_ACCOUNT_SID,
    twilio_token: !!process.env.TWILIO_AUTH_TOKEN,
    twilio_from:  !!process.env.TWILIO_FROM_NUMBER,
    twilio_to:    !!process.env.TWILIO_TO_NUMBER,
  }

  const allGood = checks.supabase.status === 'ok' &&
    Object.values(checks.env).every(Boolean)

  res.status(allGood ? 200 : 503).json({
    status:    allGood ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  })
})
