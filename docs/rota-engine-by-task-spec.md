# Rota Engine — By-Task Algorithm Spec

## Current State

The engine (`lib/rota-engine.ts`) only handles **by_shift** scheduling:

1. Determine eligible staff per day
2. Meet department coverage minimums (lab, andrology, admin)
3. Apply scheduling rules (no_coincidir, max consecutive, weekend distribution, etc.)
4. Distribute staff across shifts via round-robin
5. Post-distribution: balance empty shifts, technique-shift alignment pass

**The `taskCoverageByDay` and `taskCoverageEnabled` params exist in `EngineParams` but are never used.** The task grid UI is fully manual — users click cells to assign staff to tasks. The engine generates shift-level assignments only.

## Goal

When `taskCoverageEnabled === true`, the engine should assign staff to **tasks** (técnicas), not just shifts. The output should populate the task grid directly, so the admin gets a working rota from one click.

Key constraints:
- One person can do **multiple tasks** in a day
- Total staff per day must respect department coverage minimums
- All active shifts for the day must be used (not more)
- Task coverage minimums (`taskCoverageByDay`) must be met
- Shift preferences, avoid_shifts, rotation mode all still apply
- All scheduling rules still apply
- Weekend/days-off selection logic unchanged

---

## Algorithm Design

### Output Change

Currently `DayPlan.assignments` is `{ staff_id, shift_type }[]` — one entry per person per day.

For by_task, each assignment also needs a task. But since one person can do multiple tasks, the model is: **one assignment per staff per day** (with shift), plus a separate **task assignment** layer.

```typescript
// Existing — unchanged
export interface DayPlan {
  date: string
  assignments: { staff_id: string; shift_type: ShiftType }[]
  skillGaps: SkillName[]
}

// New — task-level detail returned alongside DayPlan
export interface TaskAssignment {
  staff_id: string
  tecnica_code: string
  date: string
}

export interface RotaEngineResult {
  days: DayPlan[]
  taskAssignments: TaskAssignment[]  // NEW — only populated when taskCoverageEnabled
  warnings: string[]
}
```

The rota actions layer writes task assignments to `rota_assignments.tecnica_id` / `function_label` when saving.

### Phase Overview

```
Phase 1: Pre-plan minimum department coverage (existing — unchanged)
Phase 2: Day-by-day staff selection + rules (existing — unchanged)
Phase 3: Shift distribution (existing — unchanged)
Phase 4: Task assignment (NEW — only when taskCoverageEnabled)
```

### Phase 4: Task Assignment

Runs after shifts are distributed. For each day:

**Inputs:**
- `assigned[]` — staff assigned to this day (from phases 1-3)
- `taskCoverageByDay` — `Record<tecnica_code, Record<day_code, number>>` e.g. `{ "ICSI": { "mon": 2, "tue": 2 }, "OPU": { "mon": 1 } }`
- `tecnicas[]` — with `codigo`, `department`, `typical_shifts`, `avoid_shifts`
- Staff skills — each staff member's `staff_skills` array

**Step 4.1: Build task demand**

```
For each técnica with coverage > 0 for this dayCode:
  demand[tecnica_code] = taskCoverageByDay[tecnica_code][dayCode]
```

**Step 4.2: Build staff capability matrix**

```
For each assigned staff member:
  qualifiedTasks[staff_id] = set of tecnica codes where staff has skill (certified or training)

  Sort: certified skills before training skills (prefer certified for coverage)
```

**Step 4.3: Assign tasks greedily — rarest skill first**

This is a variant of the "rarest first" heuristic used in constraint satisfaction:

```
1. Sort tasks by: fewest qualified staff available (ascending) — rarest first
2. For each task in order:
   a. Find qualified staff not yet at their task limit
   b. Among qualified: prefer those with fewer other task options (most constrained)
   c. Among ties: prefer certified over training, then lowest workload
   d. Assign until coverage met or no more qualified staff
3. If a task can't be fully covered: emit warning
```

**Why rarest first?** If only 2 people can do biopsies and 8 can do ICSI, assign biopsies first — the biopsy-qualified staff can still fill ICSI slots later, but not vice versa.

**Step 4.4: Task limit per person**

The `task_conflict_threshold` from lab_config (default 3) caps how many distinct tasks one person does per day. Staff already at the limit are skipped for additional tasks.

**Step 4.5: Shift-task alignment**

After task assignment, verify shift compatibility:
- If a técnica has `typical_shifts: ["T1"]` and the assigned person is on shift T2, emit a soft warning (don't block — the admin set the preference, not a hard constraint)
- If a técnica has `avoid_shifts: ["T2"]` and the person is on T2, try to swap their shift to a compatible one (same logic as the existing technique-shift alignment pass)

**Step 4.6: `no_misma_tarea` rule enforcement**

Currently a placeholder. Now enforced here:
- For each `no_misma_tarea` rule, check if any two staff from `staff_ids` are assigned to the same task on the same day
- If hard: reassign one of them to a different task they're qualified for
- If soft: emit warning

### How "Multiple Tasks Per Person" Works

A person assigned to a day can appear in multiple `TaskAssignment` entries:
```
{ staff_id: "alice", tecnica_code: "ICSI", date: "2026-03-30" }
{ staff_id: "alice", tecnica_code: "VIT",  date: "2026-03-30" }
```

The task grid UI already supports this — each técnica row has independent staff selectors. The engine just needs to output the mapping.

### Interaction with Department Coverage

Task coverage is **additive to, not replacing** department coverage. The flow:

1. Department minimums determine **how many** staff of each role work that day
2. Task coverage determines **what they do** once assigned

If task demand exceeds the number of assigned staff (because people do multiple tasks), that's fine. If task demand requires more staff than department minimums, the engine should bump up the total to cover tasks — but warn about it.

Example:
- Department minimum: 3 lab staff on Monday
- Task coverage: ICSI needs 2, OPU needs 1, VIT needs 1, Biopsy needs 1 = 5 task slots
- But some staff can do 2 tasks → 3 staff may suffice
- If not, engine adds a 4th and warns: "4 lab staff needed to cover tasks (minimum was 3)"

### Shift Distribution Awareness

Task assignment happens **after** shift distribution. The engine should prefer assigning tasks whose `typical_shifts` match the staff member's already-assigned shift. This avoids the need for shift swaps.

Ordering:
1. For each task, prefer staff already on a compatible shift
2. Only fall back to staff on other shifts if no compatible staff available
3. If fallback used, attempt shift swap (existing logic)

---

## Changes to `EngineParams`

The params already exist but are unused:

```typescript
taskCoverageEnabled?: boolean
taskCoverageByDay?: Record<string, Record<string, number>> | null
```

Also need to pass `tecnicas` with full `department` and `avoid_shifts`:

```typescript
// Current
tecnicas?: { codigo: string; typical_shifts: string[]; avoid_shifts?: string[] }[]

// Needs to also include department for filtering:
tecnicas?: { codigo: string; department: string; typical_shifts: string[]; avoid_shifts?: string[] }[]
```

And pass `task_conflict_threshold` from labConfig (already available via `labConfig.task_conflict_threshold`).

---

## Changes to Rota Actions

In `generateRota()` (`app/(clinic)/rota/actions.ts`), pass the missing params:

```typescript
const { days, taskAssignments, warnings } = runRotaEngine({
  // ... existing params ...
  taskCoverageEnabled: labConfig.task_coverage_enabled,
  taskCoverageByDay: labConfig.task_coverage_by_day,
  tecnicas: tecnicasForEngine.data.map((t) => ({
    codigo: t.codigo,
    department: t.department,
    typical_shifts: t.typical_shifts ?? [],
    avoid_shifts: t.avoid_shifts ?? [],
  })),
})
```

When saving assignments, also write task assignments:
- Look up `tecnica_id` from `tecnica_code`
- Set `function_label` to the técnica name
- Set `tecnica_id` on the rota_assignment row

---

## What Stays the Same

- Phase 1 (minimum coverage reservation) — unchanged
- Phase 2 (day-by-day selection + rules) — unchanged
- Phase 3 (shift distribution + balancing) — unchanged
- All scheduling rules — unchanged (they operate on day-level assignment)
- Skill gap detection — unchanged (but now also informed by task coverage gaps)
- Weekend/days-off logic — unchanged

---

## Edge Cases

1. **No qualified staff for a task**: Warn, don't crash. The task grid shows a gap the admin fills manually.

2. **Task coverage exceeds staff count**: Add more staff beyond department minimums if available. Warn about the bump.

3. **Training-only coverage**: If only training-level staff are available for a task, assign them but warn "solo personal en formación para [task]".

4. **All staff at task limit**: If everyone assigned to the day has hit `task_conflict_threshold`, remaining tasks go uncovered. Warn.

5. **Task with no `typical_shifts`**: Assign to any shift — no alignment constraint.

6. **Task with `avoid_shifts`**: Don't assign staff on that shift to this task. If no other staff available, warn.

---

## Files to Modify

| File | Change |
|---|---|
| `lib/rota-engine.ts` | Add Phase 4 task assignment, return `taskAssignments`, use `taskCoverageByDay` |
| `lib/types/database.ts` | No changes needed (types already exist) |
| `app/(clinic)/rota/actions.ts` | Pass taskCoverage params to engine, write task assignments to DB |
| `components/task-grid.tsx` | No changes — already renders from DB assignments |

---

## Acceptance Criteria

1. With `taskCoverageEnabled: true`, engine returns `taskAssignments[]` alongside `days[]`
2. Rarest-skill-first heuristic assigns tasks before common ones
3. One person can be assigned to multiple tasks (up to `task_conflict_threshold`)
4. Department coverage minimums still met (bumped up if tasks demand more staff)
5. All active shifts for the day are used — no shift left empty unless not enough staff
6. Shift preferences, avoid_shifts, and rotation mode respected
7. All scheduling rules (no_coincidir, supervisor, max consecutive, weekend, etc.) still enforced
8. `no_misma_tarea` rule enforced at task level
9. Warnings emitted for: uncovered tasks, training-only coverage, staff bumps, task conflicts
10. Task grid renders engine-generated assignments without UI changes
