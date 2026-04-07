-- ============================================================
-- Swap Requests — shift swap / day-off swap between staff
-- ============================================================

CREATE TABLE public.swap_requests (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id         uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  rota_id                 uuid        NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,

  -- Initiator
  initiator_staff_id      uuid        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  initiator_assignment_id uuid        NOT NULL REFERENCES public.rota_assignments(id) ON DELETE CASCADE,

  -- Type
  swap_type               text        NOT NULL CHECK (swap_type IN ('shift_swap', 'day_off')),

  -- Target
  target_staff_id         uuid        REFERENCES public.staff(id) ON DELETE CASCADE,
  target_assignment_id    uuid        REFERENCES public.rota_assignments(id) ON DELETE CASCADE,

  -- What is being swapped
  swap_date               date        NOT NULL,
  swap_shift_type         text        NOT NULL,

  -- Status flow: pending_manager → manager_approved → pending_target → approved / rejected
  status                  text        NOT NULL DEFAULT 'pending_manager'
    CHECK (status IN ('pending_manager','manager_approved','pending_target','approved','rejected','cancelled')),

  rejected_by             text,        -- 'manager' or 'target'
  rejection_reason        text,

  manager_reviewed_at     timestamptz,
  manager_reviewed_by     uuid        REFERENCES auth.users(id),

  target_responded_at     timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_swap_requests_org       ON public.swap_requests(organisation_id, status);
CREATE INDEX idx_swap_requests_initiator ON public.swap_requests(initiator_staff_id, status);
CREATE INDEX idx_swap_requests_target    ON public.swap_requests(target_staff_id, status);
CREATE INDEX idx_swap_requests_rota      ON public.swap_requests(rota_id);

-- Updated-at trigger
CREATE TRIGGER trg_swap_requests_updated_at
  BEFORE UPDATE ON public.swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Feature flag on lab_config
ALTER TABLE public.lab_config
  ADD COLUMN IF NOT EXISTS enable_swap_requests boolean NOT NULL DEFAULT false;
