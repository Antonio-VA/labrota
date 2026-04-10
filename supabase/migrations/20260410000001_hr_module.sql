-- ============================================================
-- LabRota — HR Module Schema
-- Adds: hr_module, company_leave_types, holiday_config,
--        holiday_balance, and extends leaves table
-- ============================================================

-- ── hr_module ───────────────────────────────────────────────────────────────
-- One row per tenant. Tracks install/remove lifecycle.
CREATE TABLE public.hr_module (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL UNIQUE REFERENCES public.organisations(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  installed_at    timestamptz NOT NULL DEFAULT now(),
  installed_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at      timestamptz,
  removed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_module ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_module_org_isolation"
  ON public.hr_module FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

CREATE TRIGGER trg_hr_module_updated_at
  BEFORE UPDATE ON public.hr_module
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── company_leave_types ─────────────────────────────────────────────────────
-- Per-tenant leave type definitions (replaces global enum when HR module active)
CREATE TABLE public.company_leave_types (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id       uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  name_en               text,
  has_balance           boolean     NOT NULL DEFAULT false,
  default_days          integer,
  allows_carry_forward  boolean     NOT NULL DEFAULT false,
  overflow_to_type_id   uuid        REFERENCES public.company_leave_types(id) ON DELETE SET NULL,
  is_paid               boolean     NOT NULL DEFAULT true,
  color                 text        NOT NULL DEFAULT '#3b82f6',
  is_archived           boolean     NOT NULL DEFAULT false,
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_leave_types_org ON public.company_leave_types(organisation_id);

ALTER TABLE public.company_leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_leave_types_org_isolation"
  ON public.company_leave_types FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

CREATE TRIGGER trg_company_leave_types_updated_at
  BEFORE UPDATE ON public.company_leave_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── holiday_config ──────────────────────────────────────────────────────────
-- One row per tenant. Created on HR module install.
CREATE TABLE public.holiday_config (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id             uuid        NOT NULL UNIQUE REFERENCES public.organisations(id) ON DELETE CASCADE,
  leave_year_start_month      integer     NOT NULL DEFAULT 1,
  leave_year_start_day        integer     NOT NULL DEFAULT 1,
  counting_method             text        NOT NULL DEFAULT 'working_days' CHECK (counting_method IN ('working_days', 'calendar_days')),
  weekends_deducted           boolean     NOT NULL DEFAULT true,
  public_holidays_deducted    boolean     NOT NULL DEFAULT true,
  carry_forward_allowed       boolean     NOT NULL DEFAULT true,
  max_carry_forward_days      integer     NOT NULL DEFAULT 5,
  carry_forward_expiry_month  integer     NOT NULL DEFAULT 3,
  carry_forward_expiry_day    integer     NOT NULL DEFAULT 31,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.holiday_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holiday_config_org_isolation"
  ON public.holiday_config FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

CREATE TRIGGER trg_holiday_config_updated_at
  BEFORE UPDATE ON public.holiday_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── holiday_balance ─────────────────────────────────────────────────────────
-- Per staff, per leave type, per year balance tracking.
CREATE TABLE public.holiday_balance (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id         uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  staff_id                uuid        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id           uuid        NOT NULL REFERENCES public.company_leave_types(id) ON DELETE CASCADE,
  year                    integer     NOT NULL,
  entitlement             integer     NOT NULL DEFAULT 0,
  carried_forward         integer     NOT NULL DEFAULT 0,
  cf_expiry_date          date,
  manual_adjustment       integer     NOT NULL DEFAULT 0,
  manual_adjustment_notes text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, staff_id, leave_type_id, year)
);

CREATE INDEX idx_holiday_balance_staff ON public.holiday_balance(staff_id, year);
CREATE INDEX idx_holiday_balance_org   ON public.holiday_balance(organisation_id, year);

ALTER TABLE public.holiday_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holiday_balance_org_isolation"
  ON public.holiday_balance FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

CREATE TRIGGER trg_holiday_balance_updated_at
  BEFORE UPDATE ON public.holiday_balance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── Extend leaves table ─────────────────────────────────────────────────────
-- Add HR module columns (nullable — existing rows unaffected)
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS leave_type_id   uuid REFERENCES public.company_leave_types(id) ON DELETE SET NULL;
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS days_counted    integer;
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS balance_year    integer;
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS uses_cf_days    boolean DEFAULT false;
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS cf_days_used    integer DEFAULT 0;
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS parent_leave_id uuid REFERENCES public.leaves(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leaves_leave_type_id ON public.leaves(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leaves_parent_leave  ON public.leaves(parent_leave_id);
