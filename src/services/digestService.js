import { supabase }  from '../config/supabase.js'
import { sendSMS }   from '../config/twilio.js'
import { filterWithClaude } from './claudeService.js'
import { formatDigest }     from '../utils/smsFormatter.js'

// ── Scrapers ──────────────────────────────────────────────
// Each scraper is activated per phase. Add to SCRAPERS array to enable.
// Phase 2 — active now
import { scrapeYC }      from '../scrapers/yc.js'
// import { scrapeJobSpy }  from '../scrapers/jobspy.js'
// import { scrapeIndeed }  from '../scrapers/indeed.js'
// import { scrapePallet }  from '../scrapers/pallet.js'
// Phase 3 — uncomment as built
// import { scrapeSeek }         from '../scrapers/seek.js'
// import { scrapeGradConnection } from '../scrapers/gradconnection.js'
// import { scrapeProsple }      from '../scrapers/prosple.js'
// import { scrapeBlackbird }    from '../scrapers/blackbird.js'
// import { scrapeAirtree }      from '../scrapers/airtree.js'
// import { scrapeSquarePeg }    from '../scrapers/squarepeg.js'
// import { scrapeRampersand }   from '../scrapers/rampersand.js'
// import { scrapeStartupGalaxy } from '../scrapers/startupgalaxy.js'
// import { scrapeTopStartups }  from '../scrapers/topstartups.js'
// import { scrapeBuiltInSydney } from '../scrapers/builtinsydney.js'
// import { scrapeStartupNetwork } from '../scrapers/startupnetwork.js'
// import { scrapeStartupJobs }  from '../scrapers/startupjobs.js'
// import { scrapeCompanyBrew }  from '../scrapers/companybrew.js'
// import { scrapeWellfound }    from '../scrapers/wellfound.js'
// Phase 5 — add last (most fragile)
// import { scrapeLinkedIn }     from '../scrapers/linkedin.js'

const SCRAPERS = [
  // Phase 2 — live now
  { name: 'YC Startup Jobs',              fn: scrapeYC },
  // Enable these once the scraper files export their functions.
  // { name: 'JobSpy (Indeed/LI/Glassdoor)', fn: scrapeJobSpy },
  // { name: 'Indeed MCP',                   fn: scrapeIndeed },
  // { name: 'Pallet',                       fn: scrapePallet },
  // Phase 3 scrapers go here...
]

/**
 * Run a full weekly digest:
 * 1. Run all scrapers in batches
 * 2. Upsert jobs to Supabase (dedup on url_hash)
 * 3. Filter with Claude
 * 4. Store sent_digest
 * 5. Send SMS (unless dryRun)
 *
 * @param {{ dryRun?: boolean }} options
 * @returns {Promise<{ jobsFound: number, jobsMatched: number, smsSent: boolean }>}
 */
export async function runWeeklyDigest({ dryRun = false } = {}) {
  console.log(`[digest] Starting — dryRun: ${dryRun}`)

  // ── 1. Load user prefs ────────────────────────────────
  const prefs = await getUserPrefs()
  if (!prefs) throw new Error('No user_prefs row found — run migrations and seed first')

  if (prefs.paused) {
    console.log('[digest] Alerts are paused — skipping')
    return { jobsFound: 0, jobsMatched: 0, smsSent: false, reason: 'paused' }
  }

  // ── 2. Run scrapers in batches of 3 ──────────────────
  const allJobs = await runScrapersInBatches(SCRAPERS, 3)
  console.log(`[digest] Total raw jobs scraped: ${allJobs.length}`)

  // ── 3. Upsert to Supabase (dedup on url_hash) ─────────
  if (allJobs.length > 0) {
    const { error } = await supabase
      .from('jobs')
      .upsert(allJobs, { onConflict: 'url_hash', ignoreDuplicates: true })
    if (error) console.warn('[digest] Upsert warning:', error.message)
  }

  // ── 4. Get jobs not yet sent in a digest ─────────────
  const sentHashes = await getSentJobHashes()
  const unseenJobs = allJobs.filter(j => !sentHashes.has(j.url_hash))
  console.log(`[digest] Unseen jobs: ${unseenJobs.length}`)

  if (unseenJobs.length === 0) {
    console.log('[digest] No new jobs this run')
    return { jobsFound: allJobs.length, jobsMatched: 0, smsSent: false, reason: 'no_new_jobs' }
  }

  // ── 5. Claude filter + rank ───────────────────────────
  const rankedJobs = await filterWithClaude(unseenJobs, prefs)
  console.log(`[digest] Claude matched: ${rankedJobs.length}`)

  if (rankedJobs.length === 0) {
    console.log('[digest] Claude found no strong matches')
    return { jobsFound: allJobs.length, jobsMatched: 0, smsSent: false, reason: 'no_matches' }
  }

  // ── 6. Format SMS ─────────────────────────────────────
  const smsBody = formatDigest(prefs.name || 'Cyril', rankedJobs)

  // ── 7. Store digest record ────────────────────────────
  const { data: digestRecord, error: digestError } = await supabase
    .from('sent_digests')
    .insert({
      jobs:        rankedJobs,
      job_hashes:  rankedJobs.map(j => j.url_hash),
      sms_body:    smsBody,
      sent_at:     new Date().toISOString(),
      dry_run:     dryRun,
    })
    .select()
    .single()

  if (digestError) console.warn('[digest] Digest record error:', digestError.message)

  // ── 8. Send SMS ───────────────────────────────────────
  if (!dryRun) {
    await sendSMS(smsBody)
    console.log(`[digest] SMS sent — ${rankedJobs.length} jobs`)
  } else {
    console.log('[digest] DRY RUN — SMS not sent:')
    console.log(smsBody)
  }

  return {
    jobsFound:   allJobs.length,
    jobsMatched: rankedJobs.length,
    smsSent:     !dryRun,
    digestId:    digestRecord?.id,
    preview:     smsBody,
  }
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Run scrapers in batches, collecting all normalised jobs.
 * Failed scrapers are logged and skipped — they don't stop the run.
 */
async function runScrapersInBatches(scrapers, batchSize) {
  const allJobs = []

  for (let i = 0; i < scrapers.length; i += batchSize) {
    const batch = scrapers.slice(i, i + batchSize)
    console.log(`[digest] Running batch: ${batch.map(s => s.name).join(', ')}`)

    const results = await Promise.allSettled(
      batch.map(async ({ name, fn }) => {
        try {
          const jobs = await fn()
          console.log(`[digest] ${name}: ${jobs.length} jobs`)
          return jobs
        } catch (err) {
          console.error(`[digest] ${name} failed: ${err.message}`)
          return []
        }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value)
      }
    }
  }

  return allJobs
}

async function getUserPrefs() {
  const { data } = await supabase
    .from('user_prefs')
    .select('*')
    .limit(1)
    .single()
  return data
}

async function getSentJobHashes() {
  const { data } = await supabase
    .from('sent_digests')
    .select('job_hashes')
    .order('sent_at', { ascending: false })
    .limit(10)  // Look back 10 digests to avoid re-sending

  const hashes = new Set()
  for (const row of (data || [])) {
    for (const h of (row.job_hashes || [])) hashes.add(h)
  }
  return hashes
}
