-- Enable notes toggle on lab_config
ALTER TABLE public.lab_config ADD COLUMN IF NOT EXISTS enable_notes boolean NOT NULL DEFAULT true;

-- Note templates (configured by lab manager)
CREATE TABLE IF NOT EXISTS public.note_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  text            text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS note_templates_org_idx ON public.note_templates (organisation_id);
ALTER TABLE public.note_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can manage note templates"
  ON public.note_templates FOR ALL
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- Per-week ad-hoc notes
CREATE TABLE IF NOT EXISTS public.week_notes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  week_start       date        NOT NULL,
  text             text        NOT NULL DEFAULT '',
  is_template      boolean     NOT NULL DEFAULT false,
  note_template_id uuid        REFERENCES public.note_templates(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS week_notes_org_week_idx ON public.week_notes (organisation_id, week_start);
ALTER TABLE public.week_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can manage week notes"
  ON public.week_notes FOR ALL
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());

-- Dismissed template notes per week
CREATE TABLE IF NOT EXISTS public.dismissed_note_templates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid        NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  note_template_id uuid        NOT NULL REFERENCES public.note_templates(id) ON DELETE CASCADE,
  week_start       date        NOT NULL,
  UNIQUE (organisation_id, note_template_id, week_start)
);
ALTER TABLE public.dismissed_note_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can manage dismissed notes"
  ON public.dismissed_note_templates FOR ALL
  USING (organisation_id = public.auth_organisation_id())
  WITH CHECK (organisation_id = public.auth_organisation_id());
