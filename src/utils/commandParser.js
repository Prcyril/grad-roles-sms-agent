/**
 * Parse an inbound Twilio SMS body into a structured command.
 * Case-insensitive. Returns { command, arg } or { command: 'UNKNOWN' }.
 *
 * Supported commands:
 *   APPLY [n]    APPLIED [n]   SKIP [n]    GOOD [n]
 *   LIST         STATUS        PREFS       HELP
 *   ADD [x]      REMOVE [x]
 *   PAUSE        RESUME
 */

const COMMANDS_NO_ARG = new Set([
  'LIST', 'STATUS', 'PREFS', 'HELP', 'PAUSE', 'RESUME'
])

const COMMANDS_NUM_ARG = new Set([
  'APPLY', 'APPLIED', 'SKIP', 'GOOD'
])

const COMMANDS_STR_ARG = new Set([
  'ADD', 'REMOVE'
])

/**
 * @param {string} body - Raw SMS body from Twilio
 * @returns {{ command: string, arg: string|number|null }}
 */
export function parseCommand(body) {
  if (!body || typeof body !== 'string') {
    return { command: 'UNKNOWN', arg: null }
  }

  const cleaned = body.trim().toUpperCase()
  const parts   = cleaned.split(/\s+/)
  const cmd     = parts[0]
  const rest    = parts.slice(1).join(' ')

  // ── No-arg commands ───────────────────────────────────
  if (COMMANDS_NO_ARG.has(cmd) && parts.length === 1) {
    return { command: cmd, arg: null }
  }

  // ── Numeric-arg commands ──────────────────────────────
  if (COMMANDS_NUM_ARG.has(cmd)) {
    const n = parseInt(rest, 10)
    if (!isNaN(n) && n > 0) {
      return { command: cmd, arg: n }
    }
    // Missing or invalid number
    return { command: 'UNKNOWN', arg: null, hint: `Try: ${cmd} 2` }
  }

  // ── String-arg commands ───────────────────────────────
  if (COMMANDS_STR_ARG.has(cmd) && rest.length > 0) {
    return { command: cmd, arg: rest.toLowerCase() }
  }

  return { command: 'UNKNOWN', arg: null }
}

/**
 * Map a string arg from ADD/REMOVE to a preference field + canonical value.
 * e.g. "fintech" → { field: 'industries', value: 'FinTech' }
 *      "remote"  → { field: 'locations',  value: 'Remote'  }
 *
 * @param {string} arg - Lowercased string from ADD/REMOVE command
 * @returns {{ field: string, value: string } | null}
 */
export function resolveAddRemoveArg(arg) {
  const a = arg.toLowerCase().trim()

  const industryMap = {
    'tech': 'Tech', 'technology': 'Tech',
    'fintech': 'FinTech', 'fin tech': 'FinTech',
    'saas': 'SaaS',
    'healthtech': 'HealthTech', 'health': 'HealthTech',
    'edtech': 'EdTech', 'education': 'EdTech',
    'consulting': 'Consulting',
    'finance': 'Finance',
    'media': 'Media',
    'deeptech': 'DeepTech', 'deep tech': 'DeepTech',
  }

  const locationMap = {
    'sydney': 'Sydney', 'syd': 'Sydney',
    'melbourne': 'Melbourne', 'melb': 'Melbourne',
    'brisbane': 'Brisbane', 'bris': 'Brisbane',
    'perth': 'Perth',
    'adelaide': 'Adelaide',
    'remote': 'Remote', 'wfh': 'Remote',
    'auckland': 'Auckland',
    'new zealand': 'Auckland', 'nz': 'Auckland',
  }

  const typeMap = {
    'internship': 'Internship', 'intern': 'Internship',
    'grad': 'Grad Role', 'graduate': 'Grad Role', 'grad role': 'Grad Role',
    'full time': 'Full-time', 'fulltime': 'Full-time',
    'part time': 'Part-time', 'parttime': 'Part-time',
    'contract': 'Contract',
  }

  if (industryMap[a]) return { field: 'industries', value: industryMap[a] }
  if (locationMap[a]) return { field: 'locations',  value: locationMap[a] }
  if (typeMap[a])     return { field: 'job_types',   value: typeMap[a] }

  return null
}
