import { supabase } from '../config/supabase.js'
import { sendSMS }  from '../config/twilio.js'
import { formatDeadlineAlert } from '../utils/smsFormatter.js'

const DAY_MS  = 1000 * 60 * 60 * 24
const DAYS_7  = 7  * DAY_MS
const HOURS_48 = 2 * DAY_MS

/**
 * Scan jobs with closing_date for upcoming deadlines.
 * Fires SMS for:
 *   - Jobs closing within 7 days (haven't been alerted yet)
 *   - Jobs closing within 48 hours (final warning)
 */
export async function runDeadlineScan() {
  const now    = new Date()
  const in7d   = new Date(now.getTime() + DAYS_7)
  const in48h  = new Date(now.getTime() + HOURS_48)

  // Get jobs with upcoming closing dates that haven't been skipped/applied
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .not('closing_date', 'is', null)
    .gte('closing_date', now.toISOString())    // Not already expired
    .lte('closing_date', in7d.toISOString())   // Closing within 7 days

  if (error) throw new Error(`Deadline scan DB error: ${error.message}`)
  if (!jobs || jobs.length === 0) {
    console.log('[deadline] No upcoming deadlines')
    return { alerted: 0 }
  }

  // Split into 48-hour and 7-day buckets
  const urgent  = jobs.filter(j => new Date(j.closing_date) <= in48h)
  const warning = jobs.filter(j => new Date(j.closing_date) >  in48h)

  let alerted = 0

  if (urgent.length > 0) {
    const sms = formatDeadlineAlert(urgent, '48-hour')
    await sendSMS(sms)
    console.log(`[deadline] 48-hour alert sent for ${urgent.length} job(s)`)
    alerted += urgent.length
  }

  if (warning.length > 0) {
    // Only send 7-day warning if not already sent for these jobs
    const unsent = await filterUnalertedJobs(warning, '7-day')
    if (unsent.length > 0) {
      const sms = formatDeadlineAlert(unsent, '7-day')
      await sendSMS(sms)
      await markJobsAlerted(unsent, '7-day')
      console.log(`[deadline] 7-day alert sent for ${unsent.length} job(s)`)
      alerted += unsent.length
    }
  }

  return { alerted, urgent: urgent.length, warning: warning.length }
}

// ── Helpers ───────────────────────────────────────────────

async function filterUnalertedJobs(jobs, alertType) {
  const { data } = await supabase
    .from('deadline_alerts')
    .select('job_url_hash')
    .eq('alert_type', alertType)
    .in('job_url_hash', jobs.map(j => j.url_hash))

  const alreadySent = new Set((data || []).map(r => r.job_url_hash))
  return jobs.filter(j => !alreadySent.has(j.url_hash))
}

async function markJobsAlerted(jobs, alertType) {
  const rows = jobs.map(j => ({
    job_url_hash: j.url_hash,
    alert_type:   alertType,
    alerted_at:   new Date().toISOString(),
  }))
  await supabase.from('deadline_alerts').insert(rows)
}
