import { Router } from 'express'
import { supabase }              from '../config/supabase.js'
import { sendSMS }               from '../config/twilio.js'
import { parseCommand, resolveAddRemoveArg } from '../utils/commandParser.js'
import {
  formatApplyLink, formatAppliedConfirm, formatStatus,
  formatList, formatPrefs, formatPrefUpdate, formatRating,
  formatPauseResume, formatHelp, formatUnknown
} from '../utils/smsFormatter.js'

export const smsRouter = Router()

/**
 * POST /sms/inbound
 * Twilio webhook — fires when you reply to the agent.
 * Twilio sends application/x-www-form-urlencoded.
 */
smsRouter.post('/inbound', async (req, res) => {
  // Twilio expects a 200 with empty TwiML body, or plain text
  res.set('Content-Type', 'text/xml')

  const body   = req.body.Body   || ''
  const from   = req.body.From   || ''
  const parsed = parseCommand(body)

  console.log(`[sms/inbound] From: ${from} | Body: "${body}" | Parsed:`, parsed)

  try {
    const reply = await handleCommand(parsed, from)
    if (reply) await sendSMS(reply, from)
  } catch (err) {
    console.error('[sms/inbound] Handler error:', err.message)
    await sendSMS(`Something went wrong. Try again or reply HELP.`, from)
  }

  // Always respond 200 to Twilio — empty TwiML
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`)
})

/**
 * POST /sms/test
 * Send a test SMS to your configured TO number (dev only).
 */
smsRouter.post('/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' })
  }
  try {
    const msg = await sendSMS(`JobAgent test SMS ✅ ${new Date().toISOString()}`)
    res.json({ ok: true, sid: msg.sid })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Command handler ───────────────────────────────────────

async function handleCommand({ command, arg }, from) {
  // Load prefs and latest digest for this user (keyed by phone number)
  const prefs  = await getPrefs(from)
  const digest = await getLatestDigest()

  switch (command) {

    case 'APPLY': {
      const job = getJobFromDigest(digest, arg)
      if (!job) return `No job [${arg}] found in this week's digest. Reply LIST to see all roles.`
      return formatApplyLink(job, arg)
    }

    case 'APPLIED': {
      const job = getJobFromDigest(digest, arg)
      if (!job) return `No job [${arg}] found. Reply LIST to see all roles.`
      await logApplication(job, from, 'applied')
      const counts = await getPipelineCounts(from)
      return formatAppliedConfirm(job, counts)
    }

    case 'SKIP': {
      const job = getJobFromDigest(digest, arg)
      if (!job) return `No job [${arg}] found.`
      await logApplication(job, from, 'skipped')
      return formatRating('skip', job)
    }

    case 'GOOD': {
      const job = getJobFromDigest(digest, arg)
      if (!job) return `No job [${arg}] found.`
      await logApplication(job, from, 'starred')
      return formatRating('good', job)
    }

    case 'LIST': {
      if (!digest) return `No digest found yet. Digest runs every Monday 9am.`
      const jobs = digest.jobs || []
      const date = new Date(digest.sent_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
      return formatList(jobs, date)
    }

    case 'STATUS': {
      const counts = await getPipelineCounts(from)
      const last   = digest ? new Date(digest.sent_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : 'N/A'
      const next   = getNextMondayString()
      return formatStatus(counts, last, next)
    }

    case 'PREFS': {
      return formatPrefs(prefs)
    }

    case 'ADD':
    case 'REMOVE': {
      const resolved = resolveAddRemoveArg(arg)
      if (!resolved) {
        return `Didn't recognise "${arg}". Try: ADD fintech · ADD remote · ADD internship`
      }
      const { field, value } = resolved
      const current = Array.isArray(prefs[field]) ? [...prefs[field]] : []
      let updated

      if (command === 'ADD') {
        if (current.includes(value)) return `${value} is already in your ${field}.`
        updated = [...current, value]
      } else {
        updated = current.filter(v => v !== value)
        if (updated.length === current.length) return `${value} wasn't in your ${field}.`
      }

      await updatePref(from, field, updated)
      const action = command === 'ADD' ? 'added' : 'removed'
      return formatPrefUpdate(action, value, field.replace('_', ' ').replace('ies', 'y'), updated)
    }

    case 'PAUSE': {
      await updatePref(from, 'paused', true)
      return formatPauseResume('pause')
    }

    case 'RESUME': {
      await updatePref(from, 'paused', false)
      return formatPauseResume('resume', getNextMondayString())
    }

    case 'HELP':
    default:
      return command === 'HELP' ? formatHelp() : formatUnknown()
  }
}

// ── Supabase helpers ──────────────────────────────────────

async function getPrefs(phone) {
  const { data } = await supabase
    .from('user_prefs')
    .select('*')
    .eq('phone', phone)
    .single()
  return data || {}
}

async function getLatestDigest() {
  const { data } = await supabase
    .from('sent_digests')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()
  return data || null
}

function getJobFromDigest(digest, n) {
  if (!digest || !digest.jobs) return null
  return digest.jobs[n - 1] || null  // n is 1-indexed
}

async function logApplication(job, phone, status) {
  await supabase.from('applications').upsert({
    job_url:    job.url,
    job_title:  job.title,
    company:    job.company,
    phone,
    status,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'job_url,phone' })
}

async function getPipelineCounts(phone) {
  const { data } = await supabase
    .from('applications')
    .select('status')
    .eq('phone', phone)

  const counts = { saved: 0, applied: 0, online_assessment: 0, interview: 0, offer: 0 }
  for (const row of (data || [])) {
    if (counts[row.status] !== undefined) counts[row.status]++
  }
  return counts
}

async function updatePref(phone, field, value) {
  await supabase
    .from('user_prefs')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('phone', phone)
}

function getNextMondayString() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 1 ? 7 : (1 - day + 7) % 7
  const next = new Date(now)
  next.setDate(now.getDate() + diff)
  return next.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}
