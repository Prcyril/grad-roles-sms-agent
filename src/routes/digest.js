import { Router } from 'express'
import { runWeeklyDigest } from '../services/digestService.js'

export const digestRouter = Router()

/**
 * POST /digest/run
 * Manually trigger a full digest run.
 * Use this during dev to test the pipeline without waiting for cron.
 */
digestRouter.post('/run', async (req, res) => {
  console.log('[digest] Manual trigger received')
  try {
    const result = await runWeeklyDigest({ dryRun: req.query.dry === 'true' })
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[digest] Run failed:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * GET /digest/latest
 * Returns the most recent digest from sent_digests.
 */
digestRouter.get('/latest', async (req, res) => {
  const { supabase } = await import('../config/supabase.js')
  const { data, error } = await supabase
    .from('sent_digests')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
