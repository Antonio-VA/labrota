-- Adds per-organisation engine configuration columns.
-- Controls which AI generation engines are available and which version to use.

ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS ai_optimal_version       text    NOT NULL DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS engine_hybrid_enabled    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS engine_reasoning_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_optimal_version     text    NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS task_hybrid_enabled      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_reasoning_enabled   boolean NOT NULL DEFAULT false;
