# LabRota — Task-Slot Scheduling Mode

## Context

LabRota is a multi-tenant SaaS application for embryology lab staff scheduling. It currently supports a **shift-based scheduling mode** where staff are assigned to work days and skills are used to validate coverage. This document describes a second scheduling mode: **task-slot mode**, plus the admin panel configuration required to enable it per tenant.

---

## What to Build

### 1. Admin Panel — Tenant Configuration

In the existing admin panel, add the following to the tenant configuration screen:

#### 1.1 Scheduling Mode Selector

Add a setting to each tenant's configuration:

```
Scheduling Mode:
  ○ Shift-based (default — staff assigned to days, skill coverage validated)
  ● Task-slot (staff assigned to specific procedure columns within each day)
```

- Stored as `scheduling_mode` on the tenant record: `"shift_based"` | `"task_slot"`
- Changing this setting on an existing tenant with rota data must show a **confirmation warning**: "Changing scheduling mode will affect how existing rota data is displayed. This cannot be automatically reversed. Are you sure?"
- Default for all new tenants: `shift_based`

#### 1.2 Task Column Configurator

Visible only when `scheduling_mode = task_slot`. Allows the admin to define the procedure columns for that tenant's rota grid.

Each task column has:

| Field              | Type           | Notes                                                             |
| ------------------ | -------------- | ----------------------------------------------------------------- |
| `id`               | UUID           | Auto-generated                                                    |
| `name`             | String         | e.g. "OPU", "ICSI", "Biopsy + Tubing"                            |
| `display_order`    | Integer        | Controls left-to-right column order in the grid                   |
| `allow_whole_team` | Boolean        | If true, a "Whole team" shortcut is available for this column     |
| `max_staff`        | Integer | null | Optional cap on how many staff can be assigned (null = unlimited) |

Admin UI requirements:

- List of current task columns with drag-to-reorder
- Add / edit / delete column actions
- Inline name editing
- Toggle for `allow_whole_team`
- Optional `max_staff` field
- Changes take effect immediately for that tenant

Seed the following default columns when task-slot mode is first enabled (admin can edit/delete these):

| Name               | allow_whole_team | max_staff |
| ------------------ | ---------------- | --------- |
| QC                 | false            | 1         |
| Fert Check         | false            | null      |
| OPU                | false            | null      |
| Denudation         | true             | null      |
| OV / ICSI          | true             | null      |
| Keep Timing        | true             | null      |
| Thaw / Freeze      | true             | null      |
| Biopsy + Tubing    | false            | null      |
| ET / FET           | false            | null      |
| Dish & Media Prep  | false            | null      |
| Genomix            | false            | 1         |
| Transport          | false            | null      |
| TESA               | false            | null      |
| Admin              | false            | null      |
| Off                | false            | null      |

---

### 2. Rota Grid — Task-Slot View

When a tenant has `scheduling_mode = task_slot`, replace the existing calendar day cells with a **procedure grid view**.

#### 2.1 Layout

The grid is the primary rota view for task-slot tenants. It renders as a table:

- **Rows:** Days of the selected week (Monday → Sunday), each day occupying one row
- **Columns:** Task columns as configured in the admin panel, in `display_order`
- **Cells:** Staff assignment(s) for that day × task column combination

The week navigation (back / forward / today) remains unchanged.

#### 2.2 Cell Behaviour

Each cell represents the assignment for one task on one day. A cell can hold:

- **No assignment** — displayed as empty, visually distinct (e.g. light grey background)
- **One staff member** — displayed as their initials badge
- **Multiple staff members** — displayed as a row of initials badges (e.g. `AN` `BD`)
- **Whole team** — displayed as a single "All" badge (only available on columns where `allow_whole_team = true`)

Clicking any cell opens an **assignment popover**:

```
┌─────────────────────────────────┐
│  OPU — Monday 23 March          │
│                                 │
│  Assigned:  [AN ×] [BD ×]       │
│                                 │
│  Add staff: [Search/select ▾]   │
│                                 │
│  [ ] Whole team                 │  ← only shown if allow_whole_team = true
│                                 │
│              [Clear]   [Done]   │
└─────────────────────────────────┘
```

- The staff selector is a searchable dropdown filtered to staff who are active on that date (not on leave, within start/end date)
- Multiple staff can be selected — each appears as a removable badge
- "Whole team" checkbox clears individual selections and sets the cell to whole-team mode
- "Clear" removes all assignments from the cell
- "Done" saves and closes

#### 2.3 Conflict Detection

Passive validation runs whenever assignments change. Flag the following:

| Conflict                                                        | Visual treatment                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Same staff member assigned to two or more cells on the same day | Red badge on both cells + tooltip "AN is already assigned to [other task] today" |
| Staff member is on leave on this day                            | Strikethrough in the staff selector; if already assigned, amber badge + tooltip  |
| Staff member's start_date is in the future for this day         | Greyed out and unselectable in the dropdown                                      |
| Cell exceeds `max_staff`                                        | Amber border on cell                                                             |

Conflicts are **warnings only** — they do not block saving. The manager can override.

#### 2.4 Multi-Room / Multi-Lab Support

If the tenant has more than one lab/room configured, the grid displays a **lab tab selector** above the grid (e.g. "OT 1 | OT 2"). Each lab has its own independent grid for the same week. Staff can be assigned to the same task on the same day in different labs — this is **not** flagged as a conflict (cross-lab same-day assignments are intentional).

---

### 3. Data Model Changes

#### 3.1 Tenant

Add to existing tenant record:

```
scheduling_mode: "shift_based" | "task_slot"
```

#### 3.2 TaskColumn

New table:

```
task_columns
  id              UUID  PK
  tenant_id       UUID  FK → tenants.id
  name            String
  display_order   Integer
  allow_whole_team Boolean  default false
  max_staff       Integer | null
  created_at      Timestamp
  updated_at      Timestamp
```

#### 3.3 TaskAssignment

New table:

```
task_assignments
  id              UUID  PK
  tenant_id       UUID  FK → tenants.id
  lab_id          UUID  FK → labs.id
  task_column_id  UUID  FK → task_columns.id
  date            Date
  whole_team      Boolean  default false
  created_at      Timestamp
  updated_at      Timestamp
```

#### 3.4 TaskAssignmentStaff

New join table (supports multi-person cells):

```
task_assignment_staff
  id                  UUID  PK
  task_assignment_id  UUID  FK → task_assignments.id
  staff_id            UUID  FK → staff.id
```

> Note: `task_assignment_staff` rows are ignored when `task_assignments.whole_team = true`. Do not delete them on whole_team toggle — preserve them in case the manager unticks it.

---

### 4. Rota History

The existing snapshot/history system must capture task-slot assignments when `scheduling_mode = task_slot`. Snapshots should serialise the full task assignment grid for the snapshot's date range, including `task_column_id`, `date`, `lab_id`, `whole_team`, and the list of assigned staff per cell.

Restoring a snapshot in task-slot mode restores the full grid state for that date range.

---

### 5. Export

#### CSV Export (task-slot mode)

Flat table with columns:
`Date, Lab, Task, Staff (semicolon-separated if multiple), Whole Team (Y/N)`

#### PDF Export (task-slot mode)

Render the grid as a landscape table, one page per week, with column headers matching the tenant's configured task columns. Multi-staff cells list initials separated by " / ". Whole-team cells display "All".

---

### 6. Out of Scope for This Implementation

- Auto-generation / scheduling engine for task-slot mode (shift-based auto-scheduler is unchanged and unaffected)
- Mobile view of the task-slot grid
- Per-column skill requirements in task-slot mode
- Notifications or push alerts for conflict warnings

---

## Acceptance Criteria

| #        | Criterion                                                                        |
| -------- | -------------------------------------------------------------------------------- |
| AC-TS-01 | Admin can set scheduling_mode per tenant to shift_based or task_slot             |
| AC-TS-02 | Task column configurator is visible and functional when task_slot mode is active |
| AC-TS-03 | Default task columns are seeded when task_slot mode is first enabled             |
| AC-TS-04 | Task columns can be added, renamed, reordered, and deleted by admin              |
| AC-TS-05 | Rota grid renders as a day × task-column matrix for task_slot tenants            |
| AC-TS-06 | Clicking a cell opens the assignment popover                                     |
| AC-TS-07 | Multiple staff can be assigned to a single cell                                  |
| AC-TS-08 | Whole-team assignment is available on eligible columns and displays as "All"     |
| AC-TS-09 | Staff on leave or outside employment dates are excluded from the cell selector   |
| AC-TS-10 | Same-day cross-cell conflicts are flagged with a warning badge                   |
| AC-TS-11 | Multi-lab tenants see a lab tab selector above the grid                          |
| AC-TS-12 | Cross-lab same-day assignments for the same person are not flagged as conflicts  |
| AC-TS-13 | CSV and PDF export reflect the task-slot grid structure                          |
| AC-TS-14 | Rota history snapshots capture and restore task-slot assignments correctly       |
| AC-TS-15 | Changing scheduling_mode on an existing tenant shows a confirmation warning      |
| AC-TS-16 | Shift-based mode tenants are completely unaffected by this implementation        |

---

*Document version 1.0 — Task-slot mode addition to LabRota*
