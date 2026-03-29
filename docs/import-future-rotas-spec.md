# Import Future Rotas — Bulk Schedule Upload

## Goal

Let admins upload an Excel/CSV file containing an existing or future rota → parse the grid → match staff and shifts to DB records → create rota + assignments for each week covered. This skips the AI extraction step — it's a structured data import, not pattern inference.

**Use case**: The clinic already has upcoming weeks planned in a spreadsheet. Instead of manually clicking each cell in the calendar, they upload the file and get all assignments loaded at once.

---

## How It Differs from the Existing Import

| | Historical Import (existing) | Future Rota Import (new) |
|---|---|---|
| **Purpose** | Extract config (staff, shifts, rules) from past rotas | Load actual assignments into the calendar |
| **AI needed?** | Yes — infers patterns from unstructured data | No — parses structured grid |
| **Creates staff/shifts?** | Yes — populates the system from scratch | No — matches to existing records |
| **Output** | lab_config, staff, shift_types, técnicas, rules | rotas + rota_assignments rows |
| **When used** | Onboarding (once) | Anytime — loading a planned schedule |

---

## File Format Support

### Expected layouts

The file can be in two common formats:

**Format A — Column-based (one row per assignment)**
```
Nombre    | Fecha      | Turno | Tarea
Ana López | 2026-04-06 | T1    | ICSI
Ana López | 2026-04-06 | T1    | VIT
Carlos R. | 2026-04-06 | T2    |
```

**Format B — Grid layout (days as columns, staff as rows)**
```
           | Lun 6/4 | Mar 7/4 | Mie 8/4 | ...
Ana López  | T1      | T1      | L       |
Carlos R.  | T2      | T1      | T1      |
María G.   | L       | T2      | T2      |
```

Where `L` / `Libre` / `X` / empty = day off.

### AI parsing step

Even though this isn't pattern inference, the file layout varies per clinic. Use Claude to **parse the file into a normalised structure** — same approach as the extraction endpoint but with a simpler, assignment-focused schema. This handles date format variations, name abbreviations, merged cells, and layout differences without requiring a rigid template.

---

## Extraction Schema

```typescript
// Zod schema for AI output
const futureRotaSchema = z.object({
  assignments: z.array(z.object({
    staff_name: z.string().describe("Full name as written in the file"),
    date: z.string().describe("ISO date (YYYY-MM-DD)"),
    shift_code: z.string().describe("Shift code as written (e.g. T1, M, Mañana)"),
    task_codes: z.array(z.string()).optional()
      .describe("Task/técnica codes if present (e.g. ICSI, OPU). Empty array or omit if not specified."),
  })),
  date_range: z.object({
    start: z.string().describe("First date found (ISO)"),
    end: z.string().describe("Last date found (ISO)"),
  }),
  days_off: z.array(z.object({
    staff_name: z.string(),
    date: z.string(),
  })).describe("Staff explicitly marked as off/libre on specific dates"),
  unrecognised_shifts: z.array(z.string())
    .describe("Shift codes found that don't match common patterns — flag for review"),
})
```

### AI System Prompt (addition)

```
Parse this rota/schedule file into structured assignments.

For each person on each date, extract:
- Their name (as written)
- The date (convert to ISO YYYY-MM-DD)
- Their shift code (as written — e.g. "T1", "M", "Mañana", "AM")
- Any task/técnica codes if the rota specifies tasks per person

Mark days where a person is explicitly off (L, Libre, X, Descanso, —) as days_off entries.
Skip completely empty cells — they mean the person isn't scheduled that day.

If the file covers multiple weeks, include all dates.
Dates may be in any format (DD/MM, DD/MM/YYYY, "Lunes 6 Abril", etc.) — normalise to ISO.
Names may be abbreviated — preserve as-is, the system will fuzzy-match them.
```

---

## UI Flow

### Entry Point

Add a second link in **Settings → Implementación**, below the existing historical import:

```
┌─ Importar guardias futuras ─────────────────────────────────────┐
│  📥  Importar guardias planificadas                              │
│      Sube un archivo con guardias ya planificadas para           │
│      cargarlas directamente al calendario.                       │
└──────────────────────────────────────────────────────────────────┘
```

Routes to `/onboarding/import-rota` (new page, reuses import wizard pattern).

### Wizard Steps

```
Step 1: Upload
  Upload Excel/CSV/PDF with future rota
  ↓
Step 2: Parsing (loading)
  AI extracts assignments from file
  ↓
Step 3: Review & Match
  - Show date range detected
  - Staff matching table (name → matched DB staff)
  - Shift matching table (code → matched DB shift)
  - Task matching (if by_task mode)
  - Conflict warnings (existing rotas in date range)
  - Assignment preview grid
  ↓
Step 4: Importing (loading)
  Creates rotas + assignments
  ↓
Step 5: Done
  Summary + link to calendar at the imported week
```

### Step 3: Review & Match (detail)

**Date range card:**
```
Período detectado: Lun 6 Abr — Dom 19 Abr 2026 (2 semanas)
```

**Staff matching table:**
```
┌─ Personal ──────────────────────────────────────────────┐
│  Nombre en archivo    │ Personal detectado    │ Estado  │
│  Ana López            │ Ana López ✓           │ ✅      │
│  Carlos R.            │ Carlos Rodríguez ✓    │ ✅      │  ← fuzzy match
│  Dr. Pérez            │ [Seleccionar ▼]       │ ⚠️      │  ← manual pick
│  Laura M.             │ No encontrado         │ ❌      │  ← skip or create?
└─────────────────────────────────────────────────────────┘
```

Matching logic:
1. **Exact match** — file name matches `first_name + " " + last_name`
2. **Fuzzy match** — Levenshtein distance ≤ 2, or first name + last initial matches
3. **Manual pick** — dropdown of all active staff for ambiguous matches
4. **Skip** — unmatched staff are excluded (with warning count)

**Shift matching table:**
```
┌─ Turnos ────────────────────────────────────────────────┐
│  Código en archivo  │ Turno detectado        │ Estado   │
│  T1                 │ T1 - Mañana ✓          │ ✅       │
│  M                  │ [Seleccionar ▼]        │ ⚠️       │  ← ambiguous
│  Mañana             │ T1 - Mañana ✓          │ ✅       │  ← name match
└──────────────────────────────────────────────────────────┘
```

Matching logic:
1. **Code match** — file code matches `shift_type.code` (case-insensitive)
2. **Name match** — file code matches `shift_type.name_es` or `name_en`
3. **Manual pick** — dropdown for ambiguous codes
4. **Skip** — unmapped shifts excluded (assignments using them dropped)

**Task matching** (only if rota mode is by_task and tasks found in file):
Same pattern — match `task_code` to `tecnica.codigo` or `tecnica.nombre_es`.

**Conflict warnings:**
```
⚠️ Ya existe una guardia para la semana del 6 Abr 2026.
   ○ Reemplazar — elimina la guardia existente y carga la nueva
   ● Fusionar — mantiene asignaciones manuales, añade las nuevas
   ○ Omitir semana — no importar esta semana
```

Per-week conflict resolution. Default: merge (preserves manual overrides).

**Assignment preview:**
Compact read-only grid showing the parsed assignments with matched names/shifts — same visual style as the calendar week view but static. Lets the admin eyeball correctness before importing.

---

## Import Action

### `importFutureRota(data: ParsedFutureRota)`

```typescript
interface ParsedFutureRota {
  assignments: {
    staff_id: string       // resolved from matching
    date: string           // ISO
    shift_code: string     // resolved shift type code
    task_codes?: string[]  // resolved técnica codes (by_task only)
  }[]
  days_off: {
    staff_id: string
    date: string
  }[]
  conflict_mode: Record<string, "replace" | "merge" | "skip">  // keyed by week_start
}
```

**Process per week:**

1. **Group assignments by week** — compute `week_start` (Monday) for each date

2. **For each week:**
   a. If `conflict_mode[week_start] === "skip"` → continue

   b. **Upsert rota** with `onConflict: "organisation_id,week_start"`:
      ```typescript
      { organisation_id, week_start, status: "draft", generation_type: "manual" }
      ```

   c. If `conflict_mode === "replace"`:
      - Delete all existing assignments for this rota

   d. If `conflict_mode === "merge"`:
      - Keep assignments where `is_manual_override === true`
      - Delete non-override assignments

   e. **Insert assignments:**
      - For by_shift mode: one row per staff per date, `function_label = ""`
      - For by_task mode: one row per staff per date per task, `function_label = task_code`
      - All marked `is_manual_override = false`
      - Use upsert with `onConflict: "rota_id,staff_id,date,function_label"` + `ignoreDuplicates`

   f. **Days off**: For staff in the `days_off` list — simply don't create assignments for those dates. The calendar already shows unassigned staff as "libre".

3. **Revalidate** `/` path to refresh calendar

4. **Return** summary: `{ weeks_imported, assignments_created, staff_skipped, shifts_skipped }`

---

## Fuzzy Name Matching

Use a simple approach — no external library needed:

```typescript
function matchStaffName(
  fileName: string,
  staffList: { id: string; first_name: string; last_name: string }[]
): { staff_id: string; confidence: "exact" | "fuzzy" | "none" } {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
  const target = norm(fileName)

  // 1. Exact full name match
  for (const s of staffList) {
    if (norm(`${s.first_name} ${s.last_name}`) === target) {
      return { staff_id: s.id, confidence: "exact" }
    }
  }

  // 2. First name + last initial (e.g. "Carlos R." → "Carlos Rodríguez")
  for (const s of staffList) {
    const firstInit = `${norm(s.first_name)} ${norm(s.last_name)[0]}`
    if (target === firstInit || target === `${firstInit}.`) {
      return { staff_id: s.id, confidence: "fuzzy" }
    }
  }

  // 3. First name only (if unique)
  const byFirst = staffList.filter((s) => norm(s.first_name) === target.split(" ")[0])
  if (byFirst.length === 1) {
    return { staff_id: byFirst[0].id, confidence: "fuzzy" }
  }

  return { staff_id: "", confidence: "none" }
}
```

---

## Changes to Existing Files

| File | Change |
|---|---|
| `app/api/import-rota-extract/route.ts` | **NEW** — AI extraction endpoint for future rotas |
| `app/(clinic)/onboarding/import-rota/page.tsx` | **NEW** — page shell for the wizard |
| `app/(clinic)/onboarding/import-rota/actions.ts` | **NEW** — `importFutureRota` server action |
| `components/import-rota-wizard.tsx` | **NEW** — wizard component (upload → parse → match → import → done) |
| `components/settings-implementation.tsx` | Add second import link |
| `messages/es.json` | Add `importRota` namespace |
| `messages/en.json` | Add `importRota` namespace |

---

## What This Does NOT Do

- **Does not create staff** — unmatched names are skipped. The admin adds missing staff first.
- **Does not create shifts** — unmatched codes are skipped. Shifts must exist in Lab config.
- **Does not create técnicas** — same as shifts.
- **Does not publish rotas** — all imported rotas are drafts. The admin reviews and publishes.
- **Does not run the engine** — assignments come directly from the file, no algorithmic distribution.
- **Does not handle leave creation** — days off in the file just mean "no assignment". If the admin wants formal leave records, they create those separately.

---

## Acceptance Criteria

1. Upload Excel/CSV/PDF → AI parses assignments into normalised structure
2. Staff names fuzzy-matched to existing DB staff (exact, first+initial, first-only)
3. Unmatched staff shown with manual dropdown picker or skip option
4. Shift codes matched by code or name to existing shift_types
5. Date range detected and displayed; assignments grouped by week
6. Existing rota conflicts shown per week with replace/merge/skip options
7. Merge mode preserves `is_manual_override` assignments
8. By_task mode: task codes matched to técnicas, multi-task per person supported
9. All imported rotas created as drafts with `generation_type: "manual"`
10. Summary shows weeks imported, assignments created, skipped staff/shifts
11. Calendar navigates to first imported week after completion
