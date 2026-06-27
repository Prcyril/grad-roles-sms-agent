/**
 * YC Work at a Startup scraper
 * Static HTML — uses Cheerio, no Playwright needed.
 * Filters for AU + Remote jobs only.
 */

import * as cheerio from 'cheerio'
import { normaliseJobs } from '../utils/normaliser.js'

const BASE_URL = 'https://www.workatastartup.com'

// Run multiple searches to maximise AU coverage
const SEARCHES = [
  `${BASE_URL}/jobs?demographic=any&hasEquity=any&hasSalary=any&industryTag=any&interestTag=any&jobType=any&locations=AU&remote=any&role=eng&sortBy=mostRecent`,
  `${BASE_URL}/jobs?demographic=any&hasEquity=any&hasSalary=any&industryTag=any&interestTag=any&jobType=any&locations=AU&remote=any&role=pm&sortBy=mostRecent`,
  `${BASE_URL}/jobs?demographic=any&hasEquity=any&hasSalary=any&industryTag=any&interestTag=any&jobType=any&remote=only&role=eng&sortBy=mostRecent`,
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
}

export async function scrapeYC() {
  console.log('[yc] Fetching...')

  const allRaw = []
  const seenUrls = new Set()

  for (const url of SEARCHES) {
    try {
      const jobs = await fetchYCPage(url)
      for (const job of jobs) {
        if (!seenUrls.has(job.url)) {
          seenUrls.add(job.url)
          allRaw.push(job)
        }
      }
    } catch (err) {
      console.warn(`[yc] Search failed: ${err.message}`)
    }
  }

  console.log(`[yc] ${allRaw.length} unique listings found`)

  if (allRaw.length === 0) {
    console.warn('[yc] Zero results — YC may have changed their DOM. Check selectors.')
  }

  return normaliseJobs(allRaw, 'YC')
}

async function fetchYCPage(url) {
  const res = await fetch(url, { headers: HEADERS })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const html = await res.text()
  const $    = cheerio.load(html)
  const raw  = []

  // YC uses a React app — jobs are server-side rendered into the HTML
  // Primary selectors (update if YC changes their DOM)
  const jobSelectors = [
    '.job-name',           // job title link
    '[data-job-id]',       // data attribute approach
    '.jobs-list .job',     // list container
    'a[href^="/jobs/"]',   // any link to a job
  ]

  // Strategy 1: look for job cards with data attributes
  $('[data-job-id]').each((_, el) => {
    extractJobFromElement($, el, raw)
  })

  // Strategy 2: look for job links directly
  if (raw.length === 0) {
    $('a[href^="/jobs/"]').each((_, el) => {
      const href    = $(el).attr('href')
      const title   = $(el).text().trim()
      const jobUrl  = href.startsWith('http') ? href : `${BASE_URL}${href}`

      if (!title || !jobUrl || title.length < 3) return

      // Try to find company from parent element
      const parent  = $(el).closest('.company, [class*="company"], [class*="job"]')
      const company = parent.find('[class*="company-name"], .company-name').first().text().trim()
                   || parent.find('h2, h3').first().text().trim()
                   || 'Unknown'

      const location = parent.find('[class*="location"]').text().trim() || 'Remote'

      raw.push({ url: jobUrl, title, company, location, source: 'YC Startup Jobs' })
    })
  }

  return raw
}

function extractJobFromElement($, el, raw) {
  const $el    = $(el)
  const href   = $el.find('a').first().attr('href') || $el.attr('href') || ''
  const title  = $el.find('[class*="title"], [class*="name"], h3, h4').first().text().trim()
              || $el.find('a').first().text().trim()
  const company= $el.find('[class*="company"]').first().text().trim() || 'Unknown'
  const loc    = $el.find('[class*="location"]').first().text().trim() || 'Remote'
  const salary = $el.find('[class*="salary"], [class*="compensation"]').text().trim() || null

  if (!title || !href) return

  const url = href.startsWith('http') ? href : `${BASE_URL}${href}`

  raw.push({
    url,
    title,
    company,
    location: normaliseLocation(loc),
    type:     inferType(title),
    industry: 'Tech',
    salary,
    source:   'YC Startup Jobs',
  })
}

function normaliseLocation(raw = '') {
  const lower = raw.toLowerCase()
  if (lower.includes('remote'))     return 'Remote'
  if (lower.includes('sydney'))     return 'Sydney'
  if (lower.includes('melbourne'))  return 'Melbourne'
  if (lower.includes('brisbane'))   return 'Brisbane'
  if (lower.includes('perth'))      return 'Perth'
  if (lower.includes('australia'))  return 'Australia'
  if (!raw || raw.length < 2)       return 'Remote'
  return raw.split(',')[0].trim()
}

function inferType(title = '') {
  const t = title.toLowerCase()
  if (t.includes('intern'))                          return 'Internship'
  if (t.includes('grad') || t.includes('graduate'))  return 'Grad Role'
  return 'Full-time'
}
