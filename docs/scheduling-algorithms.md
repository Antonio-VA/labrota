# LabRota — Scheduling Algorithms

Three scheduling engines power LabRota's rota generation. All are pure functions (no DB calls) for testability.

---

## Engine Overview

| Engine | File | Mode | Assigns to | Used by |
|--------|------|------|------------|---------|
| **Shift v1** | `lib/rota-engine.ts` | `by_shift` | Shifts (T1, T2, ...) | AI Optimal v1 |
| **Shift v2** | `lib/rota-engine-v2.ts` | `by_shift` | Shifts (T1, T2, ...) | AI Optimal v2, Hybrid, Claude Reasoning |
| **Task** | `lib/task-engine.ts` | `by_task` | Tasks/Técnicas (ICSI, Biopsy, ...) | Task mode orgs |

All three share the same two-phase architecture:
1. **Phase 1** — Reserve minimum coverage across all 7 days (budget pre-allocation)
2. **Phase 2** — Day-by-day assignment with rules, preferences, and distribution

---

## Phase 1: Budget Reservation

**Goal**: Guarantee that minimum coverage requirements can be met on every day before preferences kick in. Without this, greedy day-by-day assignment could exhaust a staff member's budget early in the week, leaving gaps on later days.

```
For each day (Mon → Sun):
  For each role (lab, andrology, admin):
    1. Calculate coverage requirement for this day + role
    2. Find eligible staff:
       - Active, in employment window, not on leave
       - Working pattern includes this day (v1/v2 shift engines)
       - Total reservations < days_per_week
    3. Sort by: fewest reservations → pattern match → weekend balance → workload
    4. Reserve top N staff (N = coverage requirement)
```

**Key design decisions**:
- Reservations are **guarantees** — reserved staff are always assigned in Phase 2
- Budget accounting includes future reservations: `used + 1 + futureReserved <= cap`
- Admin staff are included in reservations (fixed: previously only lab + andrology)
- Shift engines use `shiftCoverageByDay` when enabled (per-shift minimums summed by role)
- Task engine uses `coverage_by_day` (per-department minimums)

---

## Phase 2: Day-by-Day Assignment

Processes Monday through Sunday sequentially. Each day:

### Step 1: Build working staff list

```
workingStaff = reservedStaff (always) + remainingStaff (if hasBudget)

hasBudget(staff):
  used = shifts assigned so far this week
  futureReserved = days where staff is Phase 1 reserved (not yet processed)
  return (used + 1 + futureReserved) <= days_per_week
```

**Days-off preference** (lab_config.days_off_preference):
- `"always_weekend"`: Non-reserved staff blocked on weekends
- `"prefer_weekend"`: Non-reserved staff deprioritized on weekends (sorted lower)
- `"any_day"`: No weekend preference

### Step 2: Apply scheduling rules

Rules filter staff from the working list. Available rule types:

| Rule | Effect | Hard vs Soft |
|------|--------|-------------|
| `max_dias_consecutivos` | Remove staff after N consecutive days | Hard: removes (if at budget). Soft: warns |
| `distribucion_fines_semana` | Limit weekend days per month | Same |
| `no_coincidir` | Two staff can't work same day/shift | Hard: removes lower-workload person |
| `supervisor_requerido` | Trainee needs certified supervisor present | Hard: adds supervisor if missing |
| `descanso_fin_de_semana` | Rest days after weekend work | Hard: removes |
| `no_librar_mismo_dia` | Two staff can't both be off same day | Hard: keeps one working |
| `restriccion_dia_tecnica` | Staff excluded from specific day+technique combos | Hard: prevents assignment |
| `asignacion_fija` | Force staff to work specific days/shifts | Overrides other hard removals |

**v1 vs v2 rule handling**:
- **v1**: Hard removals only happen if staff has already met `days_per_week` budget. Below budget → rule ignored with warning.
- **v2**: Same budget check PLUS coverage minimum check. Won't remove if it would break L1 coverage for that role.

### Step 3: Distribute across shifts/tasks

This is where the three engines diverge significantly.

---

## Shift Engine v1 — Distribution

After determining who works each day, distributes staff across active shifts:

```
Step 3a: Fill per-shift minimums (lab)
  For each shift (T1, T2, ...):
    - Calculate shift's lab minimum from shiftCoverageByDay
    - Find unplaced lab staff, sorted by:
      1. Net scarcity (rare skills needed in this shift vs others)
      2. Rotation preference (stable/weekly/daily mode)
      3. New skill contribution
      4. Workload balance
    - Place until minimum met

Step 3b: Fair share remaining lab staff
  For each unplaced lab staff:
    - Filter out avoided shifts (avoid_shifts)
    - Sort allowed shifts by: gap below minimum → scarcity → rotation → least-filled
    - Place in best shift

Step 3c: Place andrology + admin (same minimum → fair share pattern)

Step 3d: Rotation swap pass
  For weekly/daily rotation: try same-role swaps between shifts
  to improve rotation scores. Validates avoid_shifts + technique coverage.

Step 3e: Technique-shift alignment
  Check if each technique has ≥1 qualified staff in its typical_shift.
  If not: swap within-shift or add from unassigned pool.

Step 3f: Coverage repair pass
  Re-check per-shift minimums. If broken by earlier passes, move staff
  from over-staffed shifts to under-staffed ones.
```

**Shift rotation modes**:
- `"stable"`: Round-robin per day, offset by day index (consistent week-to-week)
- `"weekly"`: Same shift all week, advance from last week
- `"daily"`: Cycle shifts by staff index + day offset

---

## Shift Engine v2 — L1/L2/L3 Constraint Hierarchy

Same distribution as v1 but with explicit constraint levels:

### Level 1 — Absolute (never break)
- L1.1 Leave: staff on leave cannot be assigned
- L1.2 Budget: each staff works exactly `days_per_week` days
- L1.3 Active shifts: if shift coverage = 0 on a day, no staff assigned
- L1.4 Days off mode: `always_weekend` is absolute
- L1.5 Calendar rules: `restriccion_dia_tecnica`
- L1.6 Shift coverage minimums per role/shift/day
- L1.7 One shift per day per person

### Level 2 — Mandatory (override only if L1 requires it)
- L2.1 Technique coverage: right skills in right shifts
- L2.2 Hard user rules (`is_hard=true`)
- L2.3 Preferred days off: `avoid_days` is strong, `preferred_days` is weak
- L2.4 Preferred shifts: `avoid_shifts` is strong, `preferred_shift` is weak

### Level 3 — Optimisation (no L1/L2 loss)
- L3.1 Fair share: excess budget distributed evenly across shifts
- L3.2 Shift rotation
- L3.3 Soft rules (`is_hard=false`)
- L3.4 Workload balance (historical 4-week lookback)

**Key difference from v1**: When a hard rule (L2) tries to remove someone, v2 checks TWO L1 constraints before allowing it:
1. Budget: `used < cap` → don't remove (L1.2)
2. Coverage: `roleCount <= roleMin` → don't remove (L1.6)

v1 only checks budget.

---

## Task Engine — Distribution

Instead of distributing across shifts, distributes across tasks (técnicas):

```
Step 3a: Build task demand
  If taskCoverageByDay enabled:
    - Read explicit per-task per-day requirements
  Else:
    - Default: 1 person per active technique

Step 3b: Sort tasks by rarity
  Tasks with fewest qualified staff get filled first (prevents deadlocks)

Step 3c: Assign staff to tasks
  For each task (rarest first):
    For each needed slot:
      - Find qualified staff (certified or training for this technique)
      - Sort by:
        1. Fewest tasks already assigned today (spread workload)
        2. Task rotation score (stable/weekly/daily)
        3. Below task conflict threshold (soft: warn if exceeded)
        4. Workload balance
      - Assign. A staff member can have MULTIPLE task assignments per day.

Step 3d: Check for skill gaps
  For each task with demand > 0: if no qualified staff assigned, emit warning.

Step 3e: Handle unassigned staff
  Staff who are working but got no tasks → added to offStaff list.
```

**Key differences from shift engines**:
- Staff can appear in multiple assignments per day (one per task)
- All assignments use a dummy shift code (shifts are irrelevant in task mode)
- Task rotation operates within departments, not across shifts
- `no_coincidir` rule scope `"same_shift"` is not applicable (no shifts)

---

## Preference System

Both shift engines support explicit and inferred preferences:

### Day preferences
- **Explicit**: `preferred_days` (+2 score), `avoid_days` (-3 score)
- **Inferred**: From historical patterns. If staff consistently works Mondays, Monday gets +1. If consistently off Fridays, Friday gets -1.5. Only used when no explicit preferences are set.

### Shift preferences
- **Explicit**: `preferred_shift` (comma-separated list of preferred shift codes), `avoid_shifts` (list of shifts to avoid)
- **Technique-based**: Staff certified in a technique with `typical_shifts` set get a soft preference for those shifts
- Avoid is treated as HARD in distribution (staff won't be placed in avoided shifts unless no alternatives exist)

---

## Workload Scoring

All engines use a 4-week historical lookback:

```
workloadScore[staffId] = count of assignments in the last 28 days
```

Staff with lower workload scores are prioritized for assignment. The score is updated after each day is processed within the current week, so later days account for earlier assignments.

---

## Hybrid Engine Flow

Not a separate engine — orchestrates v2 + Claude:

```
1. Run engine v2 → valid base rota (all L1 constraints satisfied)
2. Serialise rota + staff context + rules + coverage for Claude
3. Claude reviews and proposes changes:
   - Respect avoid_days/avoid_shifts
   - Improve fairness across shifts
   - Better rule compliance
4. Validate Claude's output:
   - Each staff's assignment count <= days_per_week (not vs engine output)
   - All staff IDs, shift codes, dates are valid
   - No one assigned on leave days
5. Recalculate shift coverage warnings from FINAL assignments
6. If validation fails → fall back to engine v2 base rota
7. Save assignments + Claude's reasoning + warnings
```

---

## Claude Reasoning Engine

Claude generates the entire rota from scratch (no engine base):

```
1. Serialise all constraints: staff, skills, leaves, coverage, rules, preferences
2. Claude receives explicit L1/L2/L3 hierarchy instructions
3. Claude generates assignments with step-by-step reasoning
4. Validate: staff IDs, shift codes, dates, leave conflicts
5. No budget validation against an engine (Claude owns the budget)
6. Save assignments + reasoning
```

Slower but can handle complex trade-offs that the deterministic engines miss.

---

## Known Edge Cases

1. **Admin staff and Phase 1**: Admin was previously excluded from Phase 1 reservations. Fixed — now included when admin coverage > 0.

2. **Working pattern as filter vs sort**: Phase 1 now filters by working_pattern (staff can't be reserved for days outside their pattern). Phase 2 sorts by pattern match but doesn't filter.

3. **`hasBudget` future reservation over-counting**: If a staff member is reserved for many future days, `hasBudget` can be overly conservative on earlier days. This is by design — it prevents over-assignment that would violate budget later.

4. **Rule removal safety**: Hard rules can remove staff, but only if it doesn't break L1 constraints (v2) or budget (v1). A warning is emitted when a rule is ignored.

5. **Single admin staff**: If there's only one admin (e.g., Cielo with `days_per_week: 6`), they must be reserved in Phase 1 for every day that needs admin coverage. Without the working_pattern filter fix, they could be reserved for their off-day, wasting budget.

6. **Shift coverage warnings timing**: Warnings are now emitted AFTER all distribution passes (fair share, rotation swaps, technique alignment, coverage repair), not after each intermediate step. This eliminates false positives.
