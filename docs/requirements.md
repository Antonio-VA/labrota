# LabRota — Product Requirements

AI-powered staff scheduling SaaS for IVF embryology labs.
Single Spanish clinic is the initial user. Multi-tenant from day one.

---

## Product Vision

Replace manual rota spreadsheets in IVF labs with an AI-assisted scheduling tool that handles shift distribution, skill coverage, leave management, and fairness — while respecting the complex constraints of embryology lab operations.

---

## User Roles

| Role | Access | Description |
|------|--------|-------------|
| **Super Admin** | Admin portal (`admin.labrota.app`) | Manages organisations, users, billing, engine config |
| **Admin** | Full clinic app | Lab manager — full config, scheduling, reports |
| **Manager** | Clinic app (limited) | Can manage schedules and approve leaves |
| **Viewer** | Own schedule + leave requests | Staff member — sees own rota, requests leave |

---

## Core Features

### 1. Schedule Management (DONE)

**Week view** — primary interface:
- 7-day grid grouped by shift (T1, T2, ...) or by person
- Staff pills with role colours (Lab blue, Andrology green, Admin grey)
- Drag-and-drop assignment editing
- OFF row showing staff who aren't working
- P+B index (punctions + biopsies / staff ratio)
- Shift highlight mode
- Transposed views (days as rows, staff as columns)

**4-week calendar** — monthly overview:
- Coverage summary per day (staff count, role breakdown)
- Week status badges (draft / published)
- Public holidays (regional, via `date-holidays` library)
- Click to navigate to week view

**Day panel** — slide-over detail for a specific day:
- Staff grouped by shift with remove/add controls
- On leave / off duty sections
- Regenerate day button
- P+B coverage index

**Staff panel** — slide-over detail for a specific person:
- Current week strip, shift debt (4-week lookback)
- Skills (certified vs training)
- Recent shifts, upcoming/past leaves
- Key info: start date, seniority, days available, preferred shift/days
- Add leave button + profile link

### 2. Rota Generation (DONE)

Five generation strategies:

| Strategy | Description |
|----------|-------------|
| Template (strict/flexible) | Copy from saved template, optionally respecting leaves |
| AI Optimal v1 | Algorithmic: assign all staff with budget, apply rules |
| AI Optimal v2 | 3-level constraint hierarchy (L1 > L2 > L3) |
| Hybrid (v2 + Claude) | Engine base rota → Claude reviews and optimises |
| Claude Reasoning | Claude generates from scratch with step-by-step reasoning |

Per-org engine configuration:
- Choose default engine version (v1/v2) per org
- Enable/disable Hybrid and Claude Reasoning per org

### 3. AI Assistant (DONE)

Chat panel integrated into schedule view:
- Powered by Claude Sonnet 4.6 via Vercel AI SDK v6
- Draft-confirm pattern for write operations
- Tools: generate rota, upsert assignments, regenerate day, publish/unlock
- AI Insights: view Claude's reasoning after hybrid/reasoning generation

### 4. Staff Management (DONE)

- Staff list with role, department, skills, status
- Staff profile: personal info, contract details, shift/day preferences
- Skill management: certified / training / not trained per technique
- Working pattern: available days per week
- Days per week: contracted shift budget
- Preferred/avoid days and shifts (3-state toggle)
- Staff colours for visual identification
- Import wizard: bulk import from Excel/CSV

### 5. Leave Management (DONE)

- Leave calendar with KPI cards (absent today, this week, upcoming, pending review)
- Leave types: annual, sick, personal, training, maternity, other
- Status workflow: pending → approved/rejected/cancelled
- Quick-create from staff panel
- Leave requests for viewer users (when enabled)
- File-based leave import (Excel/CSV parser)
- Notification when leave impacts published rota

### 6. Lab Configuration (DONE)

Eight configuration tabs:

| Tab | Purpose |
|-----|---------|
| Departments | Role definitions with colours and abbreviations |
| Shifts | Shift types with times, active days, sort order |
| Tasks (Técnicas) | Lab techniques with department, typical shifts |
| Coverage | Per-shift or per-task minimum staffing by day |
| Workload | Punctions forecast, biopsy conversion rates |
| Generator | Days-off preference, shift rotation mode |
| Rules | Scheduling rules (13 types, hard/soft, expiry dates) |
| Templates | Save/apply rota templates, weekly note templates |

### 7. Scheduling Rules (DONE)

13 rule types:

| Rule | Description |
|------|-------------|
| `max_dias_consecutivos` | Max consecutive working days |
| `distribucion_fines_semana` | Max weekend days per month |
| `no_coincidir` | Two staff can't work same day/shift |
| `supervisor_requerido` | Trainee needs certified supervisor |
| `descanso_fin_de_semana` | Rest days after weekend work |
| `no_misma_tarea` | Two staff can't share same task |
| `no_librar_mismo_dia` | Two staff can't both be off same day |
| `restriccion_dia_tecnica` | Staff excluded from day+technique combos |
| `asignacion_fija` | Force staff to specific days/shifts |
| `tecnicas_juntas` | Techniques that must be covered together |
| `tarea_multidepartamento` | Task requiring multiple departments |
| `equipo_completo` | Full team required for techniques |
| `no_turno_doble` | One shift per day per person (implicit) |

All rules support: hard/soft toggle, staff scope, optional expiry date.

### 8. Reports (DONE)

Four report types:
- **Staff summary**: shift distribution and leaves per person
- **Task coverage**: technique coverage analysis (task mode only)
- **Extra days**: staff who worked above their contract
- **Confirmed leaves**: approved leaves for a period

### 9. PDF & Excel Export (DONE)

- PDF export of weekly rota (by shift or by person view)
- Excel export with shift distribution
- Share/copy image of rota view

### 10. Settings / Admin (DONE)

**Clinic admin** (per-org):
- Organisation name and logo
- Regional config (country + region → determines holidays)
- Feature toggles (leave requests, notes, task-in-shift)
- User management (invite, roles, linked staff)
- Implementation progress tracker
- Audit log viewer

**Super admin** (cross-org):
- Organisation list with stats
- Create/manage organisations
- Per-org engine configuration
- User management
- Data backup/restore
- History import

---

## Non-Functional Requirements

### Authentication
- Magic link (OTP) for production users via `/login`
- Email + password for demo/testing via `/demo`
- Super admin role gated via `app_metadata.role`
- Supabase Auth with PKCE flow

### Internationalisation
- Spanish (default) and English
- Cookie-based locale (`next-intl` v4)
- All UI strings from `messages/es.json` and `messages/en.json`
- Server action errors in English (convention)

### Responsive Design
- Desktop-first (1280px+), breakpoint at `md` (768px)
- Schedule: full mobile support (day view, bottom nav, AI chat tab)
- All other pages: `<MobileGate>` desktop-only message

### Design System
- Clinical white backgrounds, blue accent (`#1B4F8A`), Geist typeface
- Two font sizes: 14px body, 18px headings
- 8px spacing grid, 12px border radius, 1px borders at `#CCDDEE`
- shadcn/ui (base-ui variant) — `render` prop, not `asChild`
- Loading skeletons required on every list view
- Empty states required on every list view

### Security
- Row Level Security (RLS) on all tables via `auth_organisation_id()`
- Explicit `getUser()` auth in all server actions before mutations
- `assertSuperAdmin()` in all admin portal actions
- No `dangerouslySetInnerHTML`
- No client-side `console.log` in production

### Performance
- React Compiler enabled (`babel-plugin-react-compiler`)
- Server components by default, `"use client"` only when needed
- `error.tsx` and `loading.tsx` boundaries on all route groups
- Prompt caching on AI chat system prompt

### Data
- Multi-tenant: all tables scoped by `organisation_id`
- Supabase PostgreSQL (Frankfurt region)
- Admin client (`createAdminClient()`) bypasses RLS — used only for cross-org operations
- Date formatting always via `lib/format-date.ts`, never `toLocaleDateString()`

---

## Public Holidays

Regional holidays powered by `date-holidays` npm package:
- 200+ countries with regional variants
- Islamic/lunar calendar support (UAE: Eid, Ramadan, etc.)
- Country + region configured per org in lab_config
- Displayed in week view and 4-week calendar

---

## Build Status

All features complete. Current focus: engine refinement, UX polish, and preparing for multi-clinic rollout.
