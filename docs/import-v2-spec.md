# Import v2 — Full Onboarding Config from Rota Upload

## Goal

Upload a historical rota file → AI reads it → auto-populates the full onboarding config so the new tenant is ready to go in one flow.

**Current state**: the import wizard extracts staff, shifts, techniques, rules (with confidence), rota mode, and task coverage. The review screen lets the admin confirm/edit before saving.

**What's missing**: coverage parameters (department minimums, punciones), lab settings (days off preference, shift rotation, staffing ratio), and the AI prompt doesn't know about the newest rule types. The result is that after import the admin still has to manually configure Lab → Cobertura and Lab → Parámetros before generating their first rota.

---

## Scope of Changes

### 1. Extended AI Extraction Schema

Add a new `lab_settings` object to the extraction response:

```typescript
// New in extractionSchema (zod)
lab_settings: z.object({
  coverage_by_day: z.object({
    weekday: z.object({ lab: z.number(), andrology: z.number(), admin: z.number() }),
    saturday: z.object({ lab: z.number(), andrology: z.number(), admin: z.number() }),
    sunday: z.object({ lab: z.number(), andrology: z.number(), admin: z.number() }),
  }).describe("Minimum staff per department. Count the lowest observed headcount per department on weekdays, Saturdays, and Sundays separately."),

  punctions_by_day: z.object({
    weekday: z.number(),
    saturday: z.number(),
    sunday: z.number(),
  }).describe("Daily OPU/egg collection procedure count. If the rota mentions OPU/punción counts, extract them. Otherwise use 0."),

  days_off_preference: z.enum(["always_weekend", "prefer_weekend", "any_day"])
    .describe("Infer from the rota: if days off are always sat+sun → always_weekend. If mostly weekends but some weekday offs → prefer_weekend. If days off spread across all days → any_day."),

  shift_rotation: z.enum(["stable", "weekly", "daily"])
    .describe("stable = staff keep same shift across weeks. weekly = shift changes each week. daily = shift can change daily. Infer from patterns observed."),

  admin_on_weekends: z.boolean()
    .describe("Whether admin staff appear on weekends in the rota."),

  shift_names: z.object({
    am: z.string().describe("Name used for the morning shift in the rota (e.g. 'Mañana', 'Morning', 'Turno 1'). Empty if not identifiable."),
    pm: z.string().describe("Name used for the afternoon shift (e.g. 'Tarde', 'Afternoon', 'Turno 2'). Empty if not identifiable."),
    full: z.string().describe("Name used for full-day shifts (e.g. 'Completo', 'Jornada completa'). Empty if not identifiable."),
  }).describe("Shift naming convention used in the rota. Extract the actual names/labels used, not codes."),
})
```

**Why weekday/saturday/sunday instead of per-day?** A single rota snapshot can't distinguish Monday minimums from Thursday minimums — the AI only sees observed counts, not policy. Grouping into 3 buckets (weekday, sat, sun) gives reasonable defaults the admin can fine-tune later.

### 2. Updated AI System Prompt

Add to the existing prompt (section 7):

```
7. **Lab settings**: Infer configuration defaults from the rota:
   - **Coverage by day**: Count the MINIMUM staff per department (lab, andrology, admin)
     observed on weekdays, Saturdays, and Sundays. This becomes the minimum headcount.
   - **Punciones (OPU)**: If the rota mentions procedure counts for egg collection/OPU/punción,
     extract the average per-day count. If not mentioned, return 0.
   - **Days off preference**: Look at when staff have their days off.
     "always_weekend" = everyone off sat+sun. "prefer_weekend" = most off on weekends.
     "any_day" = days off spread evenly across the week.
   - **Shift names**: Extract the actual names used for morning, afternoon, and full-day shifts
     as they appear in the rota (e.g. "Mañana", "Tarde", "Completo").
   - **Shift rotation**: "stable" = same person stays on the same shift type week after week.
     "weekly" = shifts rotate each week. "daily" = different shift every day.
   - **Admin on weekends**: Whether any admin-department staff appear on weekend days.
```

### 3. Updated Rule Type List in Prompt

The current prompt (line 26) lists outdated rule types. Update to match `RotaRuleType`:

```
Before: no_coincidir, supervisor_requerido, max_dias_consecutivos,
        distribucion_fines_semana, shift_preference, rotation_pattern, always_together

After:  no_coincidir, supervisor_requerido, max_dias_consecutivos,
        distribucion_fines_semana, descanso_fin_de_semana,
        no_misma_tarea, no_librar_mismo_dia
```

Remove `shift_preference`, `rotation_pattern`, `always_together` (these were mapped awkwardly to other types). Add the three missing valid types with descriptions:

```
- descanso_fin_de_semana: if someone works one weekend, they rest the next
- no_misma_tarea: two staff should not be assigned to the same task/procedure on the same day
- no_librar_mismo_dia: two staff should not both have the day off on the same day
```

Also update `supervisor_requerido` description: instead of "required supervisor presence" → "a designated supervisor must always be on the same day as the supervised staff". The rule now takes a `supervisor_id` param, but since at extraction time we don't have DB IDs, the AI should indicate which staff member name is the supervisor in `staff_involved[0]`.

### 4. New TypeScript Types

```typescript
// lib/types/import.ts — add:

export interface ExtractedLabSettings {
  coverage_by_day: {
    weekday: { lab: number; andrology: number; admin: number }
    saturday: { lab: number; andrology: number; admin: number }
    sunday: { lab: number; andrology: number; admin: number }
  }
  punctions_by_day: {
    weekday: number
    saturday: number
    sunday: number
  }
  days_off_preference: "always_weekend" | "prefer_weekend" | "any_day"
  shift_rotation: "stable" | "weekly" | "daily"
  admin_on_weekends: boolean
  shift_names: { am: string; pm: string; full: string }
}

// Update ExtractedData:
export interface ExtractedData {
  staff: ExtractedStaff[]
  shifts: ExtractedShift[]
  techniques: ExtractedTechnique[]
  rules: ExtractedRule[]
  rota_mode?: ExtractedRotaMode
  task_coverage?: ExtractedTaskCoverage[]
  lab_settings?: ExtractedLabSettings     // ← NEW
}
```

### 5. Review Screen — Rota Mode First, Then Config

**Rota mode is the first decision.** It determines how the entire system works — task-level assignment vs shift-level rotation. The review screen should lead with this, before showing staff/shifts/techniques.

**Review section order:**

1. **Modo de organización** — rota mode (by_task / by_shift) with radio toggle, not just display. The AI suggests one, the admin confirms or overrides. This is already extracted but currently shown as read-only.
2. **Cobertura por tarea detectada** — task coverage table (only if by_task)
3. **Configuración sugerida** — new section (see below)
4. **Personal** — staff table
5. **Turnos** — shifts
6. **Técnicas** — techniques pills
7. **Reglas** — rules with confidence

The rota mode card should use radio buttons so the admin can switch between by_task and by_shift before import. The reasoning text and confidence badge stay as contextual help.

**New "Configuración sugerida" section** — shows the inferred lab settings. All fields are editable so the admin can correct before import.

```
┌─ Configuración sugerida ──────────────────────────────────────┐
│                                                                │
│  Cobertura mínima por departamento                             │
│  ┌───────────┬─────┬──────┬───────┐                           │
│  │           │ Lab │ Andr │ Admin │                            │
│  ├───────────┼─────┼──────┼───────┤                           │
│  │ Lun–Vie   │  4  │  1   │  1    │  ← editable inputs       │
│  │ Sábado    │  2  │  1   │  0    │                           │
│  │ Domingo   │  0  │  0   │  0    │                           │
│  └───────────┴─────┴──────┴───────┘                           │
│                                                                │
│  Punciones/día       Lun–Vie: [6]  Sáb: [2]  Dom: [0]        │
│                                                                │
│  Días libres         ○ Siempre fin de semana                  │
│                      ● Preferir fin de semana                  │
│                      ○ Cualquier día                           │
│                                                                │
│  Rotación de turno   ○ Estable  ● Semanal  ○ Diaria          │
│                                                                │
│  Admin en fines      ☐                                        │
│                                                                │
│  Nombres de turno                                              │
│  Mañana: [Mañana]   Tarde: [Tarde]   Completo: [Completo]    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Design notes**:
- Use `<input type="number">` for coverage and punciones (min 0, max 20)
- Radio buttons for days_off_preference and shift_rotation
- Checkbox for admin_on_weekends
- Follow existing 14px/13px font sizing and `border-border` card style

### 6. Import Action — Apply Lab Settings

In `importHistoricalGuardia()`, add step 6 after the rota mode step:

```typescript
// ── 6. Apply lab settings if detected ─────────────────────────
if (data.lab_settings) {
  const ls = data.lab_settings
  const updates: Record<string, unknown> = {}

  // Coverage — expand weekday/sat/sun into per-day structure
  if (ls.coverage_by_day) {
    const cov: CoverageByDay = {
      mon: ls.coverage_by_day.weekday,
      tue: ls.coverage_by_day.weekday,
      wed: ls.coverage_by_day.weekday,
      thu: ls.coverage_by_day.weekday,
      fri: ls.coverage_by_day.weekday,
      sat: ls.coverage_by_day.saturday,
      sun: ls.coverage_by_day.sunday,
    }
    updates.coverage_by_day = cov
    // Also set the legacy flat fields for backward compat
    updates.min_lab_coverage = ls.coverage_by_day.weekday.lab
    updates.min_andrology_coverage = ls.coverage_by_day.weekday.andrology
    updates.min_weekend_lab_coverage = ls.coverage_by_day.saturday.lab
    updates.min_weekend_andrology = ls.coverage_by_day.saturday.andrology
  }

  // Punciones — expand into per-day
  if (ls.punctions_by_day) {
    updates.punctions_by_day = {
      mon: ls.punctions_by_day.weekday,
      tue: ls.punctions_by_day.weekday,
      wed: ls.punctions_by_day.weekday,
      thu: ls.punctions_by_day.weekday,
      fri: ls.punctions_by_day.weekday,
      sat: ls.punctions_by_day.saturday,
      sun: ls.punctions_by_day.sunday,
    }
  }

  if (ls.days_off_preference) updates.days_off_preference = ls.days_off_preference
  if (ls.shift_rotation) updates.shift_rotation = ls.shift_rotation
  if (ls.admin_on_weekends !== undefined) updates.admin_on_weekends = ls.admin_on_weekends

  // Shift names — set both es and en to the extracted names as starting point
  if (ls.shift_names) {
    if (ls.shift_names.am) {
      updates.shift_name_am_es = ls.shift_names.am
      updates.shift_name_am_en = ls.shift_names.am
    }
    if (ls.shift_names.pm) {
      updates.shift_name_pm_es = ls.shift_names.pm
      updates.shift_name_pm_en = ls.shift_names.pm
    }
    if (ls.shift_names.full) {
      updates.shift_name_full_es = ls.shift_names.full
      updates.shift_name_full_en = ls.shift_names.full
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("lab_config").update(updates as never).eq("organisation_id", orgId)
  }
}
```

### 7. Updated Rule Import Mapping

Remove the awkward fallback mappings for deprecated types:

```typescript
// Before:
} else if (r.type === "shift_preference" || r.type === "rotation_pattern") {
  ruleType = "distribucion_fines_semana"
} else if (r.type === "always_together") {
  ruleType = "no_coincidir"
}

// After: just skip unknown types
} else {
  return null // skip unknown rule type
}
```

For `supervisor_requerido`, the first name in `staff_involved` is the supervisor. After staff IDs are resolved:

```typescript
if (ruleType === "supervisor_requerido" && staffIds.length > 0) {
  params.supervisor_id = staffIds[0]  // first = supervisor
}
```

### 8. Enriched Result Summary

Update the "done" step to include lab settings in the summary:

```
✓ Importación completa
  12 miembros del equipo
  3 turnos
  8 técnicas
  4 reglas
  Cobertura y parámetros configurados  ← NEW line when lab_settings applied
```

Add `labSettings: boolean` to `ImportResult.counts` and show conditional text.

---

## Files to Modify

| File | Change |
|---|---|
| `app/api/import-extract/route.ts` | Extended schema + prompt |
| `lib/types/import.ts` | New `ExtractedLabSettings` type, updated `ExtractedData` |
| `components/import-wizard.tsx` | New "Configuración sugerida" review section |
| `app/(clinic)/onboarding/import/actions.ts` | Step 6 for lab settings, updated rule mapping |
| `messages/es.json` | Labels for new review section |
| `messages/en.json` | Labels for new review section |

---

## What We Deliberately Don't Extract

These settings are too organisation-specific to infer from a rota file:

- **Biopsy conversion rates** (biopsy_conversion_rate, biopsy_day5_pct, biopsy_day6_pct) — clinical policy, not visible in schedules
- **Staffing ratios** (ratio_optimal, ratio_minimum) — requires knowing target workloads
- **Time format** (24h/12h) — UI preference
- **First day of week** — cultural, set during org creation
- **Leave request toggle** — admin policy
- **Task conflict threshold** — requires operational knowledge

These keep their existing defaults and the admin adjusts them in Lab → Parámetros after import.

---

## Acceptance Criteria

1. Upload an Excel rota → AI returns `lab_settings` alongside existing extractions
2. **Rota mode is the first section** on the review screen, with radio toggle (not read-only)
3. Review screen shows editable coverage/punciones/preferences/shift names section
4. All numeric fields have min/max validation
5. On import, `lab_config` row is updated with coverage_by_day, punctions_by_day, days_off_preference, shift_rotation, admin_on_weekends, shift names
6. Legacy flat coverage fields (min_lab_coverage etc.) are also set for backward compat
7. Rules use the 7 valid `RotaRuleType` values — no more mapping from deprecated types
8. `supervisor_requerido` rules set `params.supervisor_id` from first staff name
9. Done screen confirms lab settings were applied
10. Admin can still fine-tune everything in Lab → Cobertura / Parámetros after import
