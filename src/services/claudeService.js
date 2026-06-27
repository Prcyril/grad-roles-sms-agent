import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Use Claude to filter and rank a list of jobs against user preferences.
 * Returns a ranked subset of jobs with the best matches first.
 *
 * @param {NormalisedJob[]} jobs   - Coarse-filtered job list
 * @param {Object}          prefs  - user_prefs row from Supabase
 * @returns {Promise<NormalisedJob[]>} - Ranked matches (best first)
 */
export async function filterWithClaude(jobs, prefs) {
  if (jobs.length === 0) return []

  const jobList = jobs.map((j, i) =>
    `[${i}] ${j.title} at ${j.company} | ${j.location} | ${j.type} | ${j.industry} | ${j.salary || 'salary n/a'} | source: ${j.source}`
  ).join('\n')

  const prompt = `You are a job matching agent for ${prefs.name || 'Cyril'}, a Computer Science + Teaching student in Australia.

User preferences:
- Industries: ${(prefs.industries || []).join(', ')}
- Job types: ${(prefs.job_types || []).join(', ')}
- Locations: ${(prefs.locations || []).join(', ')} (Remote is always acceptable)
- Keywords / titles of interest: ${prefs.keywords || 'Software Engineer, Product Manager, Data Analyst, ML Engineer'}

Job listings (index | title | company | location | type | industry | salary | source):
${jobList}

Task: Return a JSON array of indices for jobs that are a strong match for this user.
Rules:
- Include jobs where the title semantically matches the keywords (e.g. "Graduate Engineer" matches "Software Engineer")
- Include jobs where location matches OR is Remote
- Include jobs where industry matches OR is a close fit
- Exclude jobs that are clearly mismatched (e.g. nursing, law, trades)
- Rank by relevance (best match first)
- Return at most 10 indices
- Return ONLY a JSON array of integers, nothing else. Example: [2, 0, 5, 3]`

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw  = response.content[0]?.text?.trim() || '[]'
    const indices = JSON.parse(raw)

    if (!Array.isArray(indices)) throw new Error('Claude returned non-array')

    const matched = indices
      .filter(i => typeof i === 'number' && i >= 0 && i < jobs.length)
      .map(i => jobs[i])

    console.log(`[claude] Filtered ${jobs.length} → ${matched.length} matches`)
    return matched

  } catch (err) {
    console.error('[claude] Filter failed:', err.message)
    // Fallback: return first 8 jobs unfiltered rather than sending nothing
    console.warn('[claude] Falling back to unfiltered results')
    return jobs.slice(0, 8)
  }
}
