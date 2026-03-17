-- ============================================================
-- LabRota — Initial Schema
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)
-- or via: supabase db push
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE public.staff_role         AS ENUM ('lab', 'andrology', 'admin');
CREATE TYPE public.onboarding_status  AS ENUM ('active', 'onboarding', 'inactive');
CREATE TYPE public.shift_type         AS ENUM ('am', 'pm', 'full');
CREATE TYPE public.rota_status        AS ENUM ('draft', 'published');
CREATE TYPE public.leave_type         AS ENUM ('annual', 'sick', 'personal', 'other');
CREATE TYPE public.leave_status       AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.skill_name         AS ENUM (
  'icsi', 'iui', 'vitrification', 'thawing',
  'biopsy', 'semen_analysis', 'sperm_prep', 'witnessing', 'other'
);


-- ── organisations ────────────────────────────────────────────────────────────
-- One row per clinic / tenant.
CREATE TABLE public.organisations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,   -- used in URLs / API keys
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ── profiles ─────────────────────────────────────────────────────────────────
-- One row per Supabase auth user. Created automatically via trigger.
CREATE TABLE public.profiles (
  id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id uuid        REFERENCES public.organisations(id) ON DELETE SET NULL,
  email           text        NOT NULL,
  full_name       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);


-- ── staff ─────────────────────────────────────────────────────────────────────
-- Staff members scheduled on rotas. Separate from auth users —
-- staff may not have login access (future v2 self-service).
CREATE TABLE public.staff (
  id                uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid                    NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  first_name        text                    NOT NULL,
  last_name         text                    NOT NULL,
  email             text,
  role              public.staff_role       NOT NULL,
  -- JSON array of weekday codes, e.g. ["mon","tue","wed","thu","fri"]
  working_pattern   jsonb                   NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
  contracted_hours  integer                 NOT NULL DEFAULT 37,
  onboarding_status public.onboarding_status NOT NULL DEFAULT 'active',
  start_date        date                    NOT NULL,
  end_date          date,
  notes             text,
  created_at        timestamptz             NOT NULL DEFAULT now(),
  updated_at        timestamptz             NOT NULL DEFAULT now()
);


-- ── staff_skills ──────────────────────────────────────────────────────────────
-- Many-to-many: a staff member can have multiple skills.
CREATE TABLE public.staff_skills (
  id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid             NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  staff_id        uuid             NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  skill           public.skill_name NOT NULL,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (staff_id, skill)
);


-- ── leaves ───────────────────────────────────────────────────────────────────
-- Approved leave blocks a staff member from being scheduled.
-- In v1 the manager creates leave directly (no self-service request flow).
CREATE TABLE public.leaves (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid                NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  staff_id        uuid                NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  type            public.leave_type   NOT NULL,
  start_date      date                NOT NULL,
  end_date        date                NOT NULL,
  status          public.leave_status NOT NULL DEFAULT 'approved',
  notes           text,
  created_by      uuid                REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz         NOT NULL DEFAULT now(),
  updated_at      timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT leave_dates_valid CHECK (end_date >= start_date)
);


-- ── rotas ────────────────────────────────────────────────────────────────────
-- One rota per week per organisation. Uniqueness enforced by (org, week_start).
-- week_start is always a Monday.
-- Published rotas are immutable snapshots — must unlock to edit.
CREATE TABLE public.rotas (
  id              uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid              NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  week_start      date              NOT NULL,   -- always Monday
  status          public.rota_status NOT NULL DEFAULT 'draft',
  published_at    timestamptz,
  published_by    uuid              REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz       NOT NULL DEFAULT now(),
  updated_at      timestamptz       NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, week_start)
);


-- ── rota_assignments ──────────────────────────────────────────────────────────
-- Individual shift allocations within a rota.
-- shift_type stored now so v2 can add hour tracking without schema change.
-- is_manual_override preserved across regenerations when user opts in.
CREATE TABLE public.rota_assignments (
  id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid             NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  rota_id            uuid             NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  staff_id           uuid             NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date               date             NOT NULL,
  shift_type         public.shift_type NOT NULL,
  is_manual_override boolean          NOT NULL DEFAULT false,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (rota_id, staff_id, date)
);


-- ── lab_config ────────────────────────────────────────────────────────────────
-- One row per organisation. Created when org is provisioned.
-- Changes take effect on next rota generation.
CREATE TABLE public.lab_config (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid        NOT NULL UNIQUE REFERENCES public.organisations(id) ON DELETE CASCADE,
  min_lab_coverage       integer     NOT NULL DEFAULT 2,
  min_andrology_coverage integer     NOT NULL DEFAULT 1,
  min_weekend_andrology  integer     NOT NULL DEFAULT 1,
  punctions_average      integer     NOT NULL DEFAULT 0,
  staffing_ratio         numeric(4,2) NOT NULL DEFAULT 1.0,
  admin_on_weekends      boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_profiles_organisation_id       ON public.profiles(organisation_id);
CREATE INDEX idx_staff_organisation_id          ON public.staff(organisation_id);
CREATE INDEX idx_staff_status                   ON public.staff(organisation_id, onboarding_status);
CREATE INDEX idx_staff_skills_staff_id          ON public.staff_skills(staff_id);
CREATE INDEX idx_staff_skills_organisation_id   ON public.staff_skills(organisation_id);
CREATE INDEX idx_leaves_organisation_id         ON public.leaves(organisation_id);
CREATE INDEX idx_leaves_staff_id                ON public.leaves(staff_id);
CREATE INDEX idx_leaves_date_range              ON public.leaves(organisation_id, start_date, end_date);
CREATE INDEX idx_rotas_organisation_week        ON public.rotas(organisation_id, week_start);
CREATE INDEX idx_rota_assignments_rota_id       ON public.rota_assignments(rota_id);
CREATE INDEX idx_rota_assignments_staff_date    ON public.rota_assignments(organisation_id, staff_id, date);


-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGERS — updated_at
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_staff_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_leaves_updated_at
  BEFORE UPDATE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_rotas_updated_at
  BEFORE UPDATE ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_rota_assignments_updated_at
  BEFORE UPDATE ON public.rota_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_lab_config_updated_at
  BEFORE UPDATE ON public.lab_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER — auto-create profile on new auth user
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: returns the organisation_id of the currently authenticated user.
-- SECURITY DEFINER so it can read profiles without triggering RLS recursion.
CREATE OR REPLACE FUNCTION public.auth_organisation_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organisation_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

-- ── organisations ────────────────────────────────────────────────────────────
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_read_own"
  ON public.organisations FOR SELECT
  TO authenticated
  USING (id = public.auth_organisation_id());

-- ── profiles ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_own_org"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (organisation_id = public.auth_organisation_id());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- ── staff ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_org_isolation"
  ON public.staff FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- ── staff_skills ──────────────────────────────────────────────────────────────
ALTER TABLE public.staff_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_skills_org_isolation"
  ON public.staff_skills FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- ── leaves ───────────────────────────────────────────────────────────────────
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaves_org_isolation"
  ON public.leaves FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- ── rotas ────────────────────────────────────────────────────────────────────
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rotas_org_isolation"
  ON public.rotas FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- ── rota_assignments ──────────────────────────────────────────────────────────
ALTER TABLE public.rota_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rota_assignments_org_isolation"
  ON public.rota_assignments FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- ── lab_config ────────────────────────────────────────────────────────────────
ALTER TABLE public.lab_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_config_org_isolation"
  ON public.lab_config FOR ALL
  TO authenticated
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());
