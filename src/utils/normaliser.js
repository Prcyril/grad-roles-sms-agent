import { createHash } from 'crypto'

/**
 * Canonical job object shape.
 * Every scraper MUST return objects conforming to this structure.
 * Fields marked (required) will throw if missing.
 *
 * @typedef {Object} NormalisedJob
 * @property {string}      url          - Direct link to listing (required)
 * @property {string}      url_hash     - MD5 of url, used for dedup (auto-generated)
 * @property {string}      title        - Job title (required)
 * @property {string}      company      - Company name (required)
 * @property {string}      source       - Board name e.g. "GradConnection" (required)
 * @property {string}      location     - City or "Remote" (required)
 * @property {string}      type         - "Internship" | "Grad Role" | "Full-time" | "Contract"
 * @property {string}      industry     - e.g. "Tech", "FinTech", "SaaS"
 * @property {string|null} salary       - e.g. "$35/hr" or "$90k" or null
 * @property {string|null} closing_date - ISO date string or null
 * @property {string|null} description  - First 500 chars of JD or null
 * @property {Date}        scraped_at   - When this was scraped (auto-set)
 */

const REQUIRED = ['url', 'title', 'company', 'source', 'location']

const VALID_TYPES = ['Internship', 'Grad Role', 'Full-time', 'Part-time', 'Contract']

const VALID_INDUSTRIES = [
  'Tech', 'FinTech', 'SaaS', 'HealthTech', 'EdTech',
  'Consulting', 'Finance', 'Media', 'DeepTech', 'Other'
]

/**
 * Normalise a raw scraper result into a canonical job object.
 * Validates required fields, coerces types, auto-generates url_hash.
 *
 * @param {Object} raw - Raw object from scraper
 * @returns {NormalisedJob}
 */
export function normaliseJob(raw) {
  // ── Validate required fields ──────────────────────────
  for (const field of REQUIRED) {
    if (!raw[field] || typeof raw[field] !== 'string' || !raw[field].trim()) {
      throw new Error(`normaliseJob: missing required field "${field}" in ${JSON.stringify(raw)}`)
    }
  }

  // ── URL must be a valid http(s) URL ───────────────────
  const url = raw.url.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`normaliseJob: invalid url "${url}"`)
  }

  // ── Coerce type ───────────────────────────────────────
  let type = raw.type || 'Full-time'
  if (!VALID_TYPES.includes(type)) {
    // Try to infer from title/type string
    const lower = type.toLowerCase()
    if (lower.includes('intern'))        type = 'Internship'
    else if (lower.includes('grad'))     type = 'Grad Role'
    else if (lower.includes('part'))     type = 'Part-time'
    else if (lower.includes('contract')) type = 'Contract'
    else                                 type = 'Full-time'
  }

  // ── Coerce industry ───────────────────────────────────
  let industry = raw.industry || 'Tech'
  if (!VALID_INDUSTRIES.includes(industry)) {
    industry = 'Other'
  }

  // ── Coerce location ───────────────────────────────────
  let location = raw.location.trim()
  // Normalise common variants
  const locMap = {
    'sydney nsw': 'Sydney',
    'melbourne vic': 'Melbourne',
    'brisbane qld': 'Brisbane',
    'perth wa': 'Perth',
    'adelaide sa': 'Adelaide',
    'work from home': 'Remote',
    'wfh': 'Remote',
    'anywhere': 'Remote',
  }
  location = locMap[location.toLowerCase()] || location

  // ── Build canonical object ────────────────────────────
  return {
    url,
    url_hash:     hashUrl(url),
    title:        raw.title.trim(),
    company:      raw.company.trim(),
    source:       raw.source.trim(),
    location,
    type,
    industry,
    salary:       raw.salary       ? String(raw.salary).trim()       : null,
    closing_date: raw.closing_date ? normaliseDate(raw.closing_date) : null,
    description:  raw.description  ? String(raw.description).slice(0, 500).trim() : null,
    scraped_at:   new Date().toISOString(),
  }
}

/**
 * Normalise an array of raw jobs, skipping invalid ones with a warning.
 * @param {Object[]} raws
 * @param {string} scraperName - for logging
 * @returns {NormalisedJob[]}
 */
export function normaliseJobs(raws, scraperName = 'unknown') {
  const results = []
  for (const raw of raws) {
    try {
      results.push(normaliseJob(raw))
    } catch (err) {
      console.warn(`[normaliser] ${scraperName}: skipping invalid job — ${err.message}`)
    }
  }
  console.log(`[normaliser] ${scraperName}: ${results.length}/${raws.length} jobs normalised`)
  return results
}

/**
 * Generate MD5 hash of a URL for deduplication.
 * Strips trailing slashes and lowercases for consistency.
 * @param {string} url
 * @returns {string} 32-char hex string
 */
export function hashUrl(url) {
  const normalised = url.trim().toLowerCase().replace(/\/$/, '')
  return createHash('md5').update(normalised).digest('hex')
}

/**
 * Attempt to parse a closing date string into ISO format.
 * Returns null if unparseable.
 * @param {string|Date} raw
 * @returns {string|null} ISO date string
 */
function normaliseDate(raw) {
  if (!raw) return null
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return null
    return d.toISOString()
  } catch {
    return null
  }
}
