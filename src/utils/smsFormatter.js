/**
 * SMS formatter — every outbound message template lives here.
 * Keep each segment under 160 chars. Multi-segment is fine (Twilio concatenates)
 * but each segment costs ~$0.008 AUD. Target: digest ≤3 segments, replies ≤1.
 */

/**
 * Format the weekly digest SMS.
 * Shows top 5 roles inline, invites LIST for the rest.
 *
 * @param {string} name - User's first name
 * @param {Array}  jobs - Full matched + ranked job array
 * @param {string} aiSummary - One-line Claude summary (optional)
 * @returns {string}
 */
export function formatDigest(name, jobs, aiSummary = null) {
  const total = jobs.length
  const shown = jobs.slice(0, 5)
  const extra = total - shown.length

  const lines = shown.map((j, i) =>
    `[${i + 1}] ${j.title} · ${j.company} · ${j.location}${j.salary ? ` · ${j.salary}` : ''}`
  )

  let msg = `Hey ${name}! 🎯 ${total} new role${total !== 1 ? 's' : ''} this week.\n\n`
  msg += lines.join('\n')

  if (extra > 0) msg += `\n+ ${extra} more → reply LIST`

  msg += `\n\nReply APPLY [n] for link · APPLIED [n] to log · HELP for all commands`

  return msg
}

/**
 * Format the full LIST response (all jobs from current digest).
 * @param {Array}  jobs
 * @param {string} digestDate - e.g. "Mon 9 Jun"
 * @returns {string}
 */
export function formatList(jobs, digestDate) {
  const lines = jobs.map((j, i) =>
    `[${i + 1}] ${j.title} · ${j.company} · ${j.location}`
  )

  return [
    `All ${jobs.length} roles · ${digestDate}`,
    '',
    lines.join('\n'),
    '',
    'Reply APPLY [n] for link · APPLIED [n] to log'
  ].join('\n')
}

/**
 * Format the APPLY [n] response — sends direct URL.
 * @param {Object} job
 * @param {number} n - Job number in digest
 * @returns {string}
 */
export function formatApplyLink(job, n) {
  let msg = `[${n}] ${job.title} · ${job.company} · ${job.location}`
  if (job.salary)       msg += ` · ${job.salary}`
  msg += `\n\n${job.url}`
  if (job.closing_date) {
    const d = new Date(job.closing_date)
    msg += `\n\nCloses: ${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`
  }
  msg += `\n\nGood luck! 🙌`
  return msg
}

/**
 * Format the APPLIED [n] confirmation.
 * @param {Object} job
 * @param {Object} pipelineCounts - { saved, applied, online_assessment, interview, offer }
 * @returns {string}
 */
export function formatAppliedConfirm(job, pipelineCounts) {
  const { saved = 0, applied = 0, online_assessment = 0, interview = 0, offer = 0 } = pipelineCounts
  return [
    `✅ Logged! ${job.title} @ ${job.company} marked as applied.`,
    '',
    `Your pipeline: ${saved} saved · ${applied} applied · ${online_assessment} OA · ${interview} interview · ${offer} offer`,
    '',
    `Reply STATUS for full breakdown.`
  ].join('\n')
}

/**
 * Format the STATUS response.
 * @param {Object} pipelineCounts
 * @param {string} lastDigestDate - e.g. "Mon 9 Jun"
 * @param {string} nextDigestDate - e.g. "Mon 16 Jun"
 * @returns {string}
 */
export function formatStatus(pipelineCounts, lastDigestDate, nextDigestDate) {
  const { saved = 0, applied = 0, online_assessment = 0, interview = 0, offer = 0 } = pipelineCounts
  return [
    `📊 Your pipeline`,
    '',
    `Saved:     ${saved}`,
    `Applied:   ${applied}`,
    `Online A:  ${online_assessment}`,
    `Interview: ${interview}`,
    `Offers:    ${offer}`,
    '',
    `Last digest: ${lastDigestDate}`,
    `Next digest: ${nextDigestDate} 9am`,
    '',
    `Reply LIST for this week's roles.`
  ].join('\n')
}

/**
 * Format a deadline warning (7-day or 48-hour).
 * @param {Array}  jobs    - Jobs with closing_date ≤ threshold
 * @param {string} urgency - "7-day" | "48-hour"
 * @returns {string}
 */
export function formatDeadlineAlert(jobs, urgency) {
  const is48 = urgency === '48-hour'
  const emoji = is48 ? '🔴' : '⚠️'
  const header = is48
    ? `${emoji} FINAL 48hrs, Cyril`
    : `${emoji} Deadline alert, Cyril`

  if (is48 && jobs.length === 1) {
    // Single 48-hr alert — include direct URL
    const j = jobs[0]
    const d = new Date(j.closing_date)
    return [
      header,
      '',
      `${j.title} · ${j.company} · ${j.location}`,
      `Closes: ${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} AEST`,
      '',
      `Apply → ${j.url}`,
    ].join('\n')
  }

  const lines = jobs.map(j => {
    const d = new Date(j.closing_date)
    const daysLeft = Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24))
    return `${j.title} · ${j.company} — closes in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
  })

  return [
    header,
    '',
    lines.join('\n'),
    '',
    `Reply APPLY [n] for link · SKIP [n] to dismiss`
  ].join('\n')
}

/**
 * Format PREFS response — current user preferences.
 * @param {Object} prefs - user_prefs row from Supabase
 * @returns {string}
 */
export function formatPrefs(prefs) {
  return [
    `⚙️ Your current settings:`,
    '',
    `Industries: ${(prefs.industries || []).join(', ')}`,
    `Types:      ${(prefs.job_types || []).join(', ')}`,
    `Locations:  ${(prefs.locations || []).join(', ')}`,
    `Keywords:   ${prefs.keywords || 'none set'}`,
    '',
    `Schedule: ${prefs.frequency || 'Monday'} 9am AEST`,
    `Sources:  ${prefs.active_sources || 21} boards active`,
    '',
    `Reply HELP for all commands.`
  ].join('\n')
}

/**
 * Format ADD / REMOVE confirmation.
 * @param {string}   action  - "added" | "removed"
 * @param {string}   value   - What was changed
 * @param {string}   field   - "industry" | "location" | "type"
 * @param {string[]} current - Updated list
 * @returns {string}
 */
export function formatPrefUpdate(action, value, field, current) {
  return [
    `✅ ${action === 'added' ? 'Added' : 'Removed'} ${value} ${action === 'added' ? 'to' : 'from'} your ${field}s.`,
    '',
    `Current: ${current.join(', ')}`,
  ].join('\n')
}

/**
 * Format SKIP / GOOD rating confirmation.
 * @param {string} action - "skip" | "good"
 * @param {Object} job
 * @returns {string}
 */
export function formatRating(action, job) {
  if (action === 'skip') {
    return `👍 Got it — ${job.title} @ ${job.company} dismissed. Won't show similar roles.`
  }
  return `⭐ Noted — ${job.title} @ ${job.company} marked as strong match. I'll surface more like this.`
}

/**
 * Format PAUSE / RESUME confirmation.
 * @param {string} action - "pause" | "resume"
 * @param {string} nextDigestDate - e.g. "Mon 16 Jun"
 * @returns {string}
 */
export function formatPauseResume(action, nextDigestDate = null) {
  if (action === 'pause') {
    return `⏸ Alerts paused. Reply RESUME to restart.`
  }
  return `▶️ Alerts resumed. Next digest: ${nextDigestDate} 9am.`
}

/**
 * The HELP menu.
 * @returns {string}
 */
export function formatHelp() {
  return [
    `JobAgent commands:`,
    '',
    `APPLY [n]    → get job link`,
    `APPLIED [n]  → log application`,
    `SKIP [n]     → dismiss role`,
    `GOOD [n]     → mark as strong`,
    `LIST         → all this week's roles`,
    `STATUS       → your pipeline`,
    `PREFS        → your settings`,
    `ADD [x]      → add industry/location`,
    `REMOVE [x]   → remove industry/location`,
    `PAUSE        → stop alerts`,
    `RESUME       → restart alerts`,
    `HELP         → this menu`,
  ].join('\n')
}

/**
 * Fallback for unrecognised commands.
 * @returns {string}
 */
export function formatUnknown() {
  return `Didn't catch that. Reply HELP for commands.`
}
