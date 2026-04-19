-- ============================================================
-- Rota generation lock
--
-- Previous behaviour: the four rota generation entry points
-- (generateRota, generateRotaWithAI, generateRotaHybrid,
-- generateTaskHybrid) each did delete-then-insert on
-- `rota_assignments` with `ignoreDuplicates: true`, so two
-- concurrent runs for the same week could interleave and leave
-- the rota in a garbled half-of-each state.
--
-- This column is an advisory lock: acquireRotaGenerationLock sets
-- `generating_at = now()` iff the column is null or older than
-- STALE_LOCK_MS, and releaseRotaGenerationLock clears it. The
-- stale-lock cutoff lets a crashed generator release its lock
-- automatically after 10 minutes without manual intervention.
-- ============================================================

ALTER TABLE public.rotas
  ADD COLUMN IF NOT EXISTS generating_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rotas_generating_at
  ON public.rotas (generating_at)
  WHERE generating_at IS NOT NULL;
