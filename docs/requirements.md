# LabRota — Product Requirements

AI-powered staff scheduling SaaS for IVF embryology labs.  
Initial customer: single Spanish clinic. Multi-tenant architecture from day one.

---

## 1. Product Vision

Replace manual rota spreadsheets in IVF labs with an AI-assisted scheduling tool that handles shift distribution, skill coverage, leave management, and fairness — while respecting the complex human and operational constraints of embryology lab work.

---

## 2. User Roles

| Role | Access level | Description |
|------|-------------|-------------|
| **Super Admin** | Admin portal (`admin.labrota.app`) | Manages all organisations, billing, engine config, HR module provisioning |
| **Admin** | Full clinic app | Lab manager — full scheduling, config, reports, user management |
| **Manager** | Clinic app | Can generate rotas, approve/reject leaves, manage swaps |
| **Viewer** | Own schedule + leave requests | Staff member — read-only; can request leave and swaps for own shifts |

---

## 3. Functional Requirements

### 3.1 Schedule Management

#### Week View (primary interface)
- **FR-SCH-01** Display a 7-day grid with rows organised by shift type (by_shift mode) or by IVF technique/task (by_task mode)
- **FR-SCH-02** Show staff chips per cell, colour-coded by department (Lab = blue, Andrology = green, Admin = grey)
- **FR-SCH-03** Drag-and-drop assignment of staff between cells within the same week
- **FR-SCH-04** Click empty cell to add assignment; click chip to edit or remove
- **FR-SCH-05** Show leave indicators on staff chips when the person is on approved leave that day
- **FR-SCH-06** Show skill/technique badges on chips where a technique is assigned
- **FR-SCH-07** Display per-day punction (egg retrieval) counts; allow inline editing
- **FR-SCH-08** Warn on coverage gaps and skill shortfalls via a toolbar warning indicator

#### Month View
- **FR-SCH-09** Show a 4-week rolling summary with published/draft/empty status per week
- **FR-SCH-10** Support biopsy forecast overlay (conversion rate × punction counts)

#### Day View
- **FR-SCH-11** Detailed single-day view with all shift assignments and leave info

#### Navigation
- **FR-SCH-12** Previous/next week navigation with pre-fetch of adjacent weeks for instant response
- **FR-SCH-13** "Today" button to jump to current week

#### Draft / Publish
- **FR-SCH-14** Rotas exist in draft (editor-only) or published (visible to all) states
- **FR-SCH-15** Publish action locks rota and triggers email notification to configured recipients
- **FR-SCH-16** Published rotas can be unlocked and edited; changes take effect immediately

#### Templates
- **FR-SCH-17** Save any week's assignments as a named template
- **FR-SCH-18** Apply template to a week in strict (exact copy) or flexible (fill gaps) mode
- **FR-SCH-19** Rename and delete templates

#### Undo / Redo
- **FR-SCH-20** Undo/redo stack for manual edits within a session (Ctrl+Z / Ctrl+Y)

#### Week Tools
- **FR-SCH-21** Copy previous week (duplicate all assignments)
- **FR-SCH-22** Clear week (delete all assignments for the week)
- **FR-SCH-23** Copy single day from previous week
- **FR-SCH-24** Add weekly summary note; save note templates
- **FR-SCH-25** Regenerate a single day without affecting the rest of the week

---

### 3.2 AI Rota Generation

- **FR-GEN-01** Generate a full week rota automatically from lab rules, staff constraints, coverage requirements, and leave data
- **FR-GEN-02** Support multiple generation strategies: algorithmic v1, algorithmic v2 (L1/L2/L3 constraints), AI Hybrid (v2 + Claude review), Claude Reasoning (full Claude generation)
- **FR-GEN-03** AI generation must respect: leave blocks, working patterns, days-per-week budgets, max consecutive days, skill requirements, scheduling rules, and department coverage minimums
- **FR-GEN-04** Hybrid generation sends v2 output to Claude for review; Claude proposes corrections; system validates and applies
- **FR-GEN-05** Store engine warnings (coverage gaps, rule violations, skill shortfalls) on the rota record
- **FR-GEN-06** Enforce a configurable daily hybrid generation quota per organisation
- **FR-GEN-07** Manual overrides (is_manual_override flag) survive regeneration of the same week

---

### 3.3 AI Chat Assistant

- **FR-AI-01** Embedded AI chat panel accessible from the schedule page on desktop; full-screen tab on mobile
- **FR-AI-02** Assistant can answer scheduling questions (read tools): week rota, coverage analysis, staff list, staff detail, leaves, lab config, techniques, departments, rules, skill matrix
- **FR-AI-03** Assistant can perform write operations (propose tools) that require user confirmation before executing: generate rota, regenerate day, copy previous week, assign staff, publish, unlock, add leave, add note, update staff, manage skills, deactivate staff, update coverage, manage rules, manage leaves
- **FR-AI-04** All propose tools create a confirmation card; assistant must never say the action is done before the user clicks Apply
- **FR-AI-05** Assistant is context-aware: knows which page and which week the user is viewing
- **FR-AI-06** Assistant can answer product questions ("how do I…", "where is…") and direct users to `docs.labrota.app` for documentation
- **FR-AI-07** Rate-limited to 20 requests/minute per user

---

### 3.4 Staff Management

- **FR-STF-01** Create, edit, and deactivate staff members
- **FR-STF-02** Per-staff fields: name, email, role/department, contract type (full-time/part-time/intern), working pattern (which days), days per week budget, preferred/avoided shifts, preferred/avoided days, on-call volunteer flag, start/end dates, onboarding end date
- **FR-STF-03** Per-staff skill certifications: skill name + level (certified / training)
- **FR-STF-04** Bulk operations: add/remove skills, update status, deactivate multiple staff
- **FR-STF-05** Staff profile page with assignment history, skill summary, leave balance
- **FR-STF-06** Onboarding status tracking: onboarding → active → inactive

---

### 3.5 Leave Management

- **FR-LVE-01** Leave types: annual, sick, personal, training, maternity/paternity, other
- **FR-LVE-02** Leave statuses: pending → approved / rejected; approved → cancelled
- **FR-LVE-03** Creating or updating an approved leave auto-removes conflicting rota assignments
- **FR-LVE-04** Approval board: view pending/approved/rejected leaves with bulk approve/reject
- **FR-LVE-05** Calendar view showing leave blocks per staff member
- **FR-LVE-06** Quick-create leave directly from the rota view
- **FR-LVE-07** Outlook calendar sync (if feature-flagged): import out-of-office events as leaves, per-staff connect/disconnect, manual and automatic sync

#### HR Module (optional, provisioned per org)
- **FR-LVE-08** Company-defined leave types with annual allowance and carry-forward limits
- **FR-LVE-09** Per-staff per-year leave balance tracking: allowance, used, remaining, carry-forward
- **FR-LVE-10** Leave balance reports with public holiday deduction

---

### 3.6 Lab Configuration

- **FR-LAB-01** Define shift types (code, name ES/EN, start/end times, active days, sort order)
- **FR-LAB-02** Define IVF techniques/tasks (code, names, department, required skill, typical/avoided shifts, active toggle)
- **FR-LAB-03** Define departments with hierarchy (parent-child), abbreviations, colours
- **FR-LAB-04** Set daily coverage minimums per role (lab/andrology/admin), per day of week, with separate weekend minimums
- **FR-LAB-05** Set per-shift coverage requirements (by_shift mode)
- **FR-LAB-06** Set per-technique coverage requirements (by_task mode)
- **FR-LAB-07** Enter expected punction (egg retrieval) counts per day; used for AI headcount targets
- **FR-LAB-08** Configure biopsy forecast (conversion rate, day-5 %, day-6 %)
- **FR-LAB-09** Create scheduling rules with type, affected staff, parameters, optional expiry date; enable/disable without deletion
- **FR-LAB-10** Configure guardia (weekend on-call): min weeks between, max per month
- **FR-LAB-11** Configure public holiday mode and regional holiday data (autonomous community / country)
- **FR-LAB-12** Set working-week defaults: first day of week, time format (24h/12h), shift name overrides

---

### 3.7 Scheduling Rules Engine

Supported rule types:
- `no_coincidir` — two staff cannot be scheduled on the same day
- `supervisor_requerido` — one named staff must be present whenever another is scheduled
- `max_dias_consecutivos` — maximum consecutive working days for named staff
- `distribucion_fines_semana` — fair weekend shift distribution
- `descanso_fin_de_semana` — minimum weekend rest
- `no_misma_tarea` — two staff cannot be assigned the same task on the same day
- `no_librar_mismo_dia` — two staff cannot both have the day off simultaneously
- `restriccion_dia_tecnica` — restrict a staff member from a specific day or technique
- `asignacion_fija` — fixed assignment on a specific day
- `tecnicas_juntas` — two techniques must always be assigned together
- `tarea_multidepartamento` — a task requires staff from multiple departments
- `equipo_completo` — whole team must be present

---

### 3.8 Reports

- **FR-RPT-01** Staff workload summary: assignments, days off, leave days, variance from mean; by date range; export to Excel/PDF
- **FR-RPT-02** Technique coverage report: days covered/uncovered per technique, coverage %, qualified staff count; export to Excel/PDF
- **FR-RPT-03** Skill matrix report: all staff × all skills; certified vs training; export to Excel/PDF
- **FR-RPT-04** HR leave balance report (if HR module active): allowance, used, remaining per staff per year

---

### 3.9 PDF Export

- **FR-PDF-01** Export week rota to PDF in two formats: by shift (rows = shifts, columns = days) or by person (rows = staff, columns = days)
- **FR-PDF-02** PDF includes: org name, week range, published status, role colour coding, punction counts, coverage summary, technique assignments, skill gap indicators, weekly notes
- **FR-PDF-03** Share via Web Share API (mobile) or open in new tab (desktop)

---

### 3.10 Settings & Organisation

- **FR-SET-01** Organisation profile: name, logo (HTTPS URL only), auth method (OTP / password)
- **FR-SET-02** Display mode: by_shift or by_task (affects grid layout, generation engine, reporting)
- **FR-SET-03** User management: invite by email, assign role, set display name, link viewer to staff, remove user
- **FR-SET-04** Feature flags per org: leave requests, swap requests, Outlook sync, weekly notes, task-in-shift overlay, AI hybrid generation
- **FR-SET-05** Engine configuration: algorithm version (v1/v2), hybrid enabled, reasoning enabled, daily hybrid quota
- **FR-SET-06** Notification settings: configure email recipients for rota publish events; email format (by_shift / by_person)
- **FR-SET-07** Implementation wizard: step-by-step onboarding checklist with completion tracking
- **FR-SET-08** Audit log: timestamped record of all write actions (who did what, when)
- **FR-SET-09** Billing info display: contract start/end dates, fee

#### User Preferences (per user)
- **FR-SET-10** Theme: light / dark / system auto
- **FR-SET-11** Accent colour: 8 preset options
- **FR-SET-12** Font scale: small / normal / large
- **FR-SET-13** Locale: Spanish / English
- **FR-SET-14** Avatar upload

---

### 3.11 Swap Requests

- **FR-SWP-01** Staff (viewer role) can request a shift swap with another eligible staff member
- **FR-SWP-02** Swap types: shift_swap (exchange two shifts) or day_off (swap one shift for a day off)
- **FR-SWP-03** Manager approval required; workflow: pending_manager → manager_approved → pending_target → approved/rejected
- **FR-SWP-04** Only available in by_shift mode

---

### 3.12 Mobile

- **FR-MOB-01** Mobile support limited to the schedule page (day view)
- **FR-MOB-02** Bottom navigation: Schedule tab, Chat tab
- **FR-MOB-03** Day view with swipe between days
- **FR-MOB-04** All assignment operations (tap to assign, tap chip to edit, swipe to remove)
- **FR-MOB-05** AI chat full-screen on mobile
- **FR-MOB-06** All other pages show a "please use desktop (1280px+)" gate

---

### 3.13 Documentation & Help

- **FR-HLP-01** Help link in user avatar dropdown menu (above Support), linking to `docs.labrota.app`
- **FR-HLP-02** In-app support modal (contact form → email to support)
- **FR-HLP-03** AI assistant can answer product questions and direct users to documentation
- **FR-HLP-04** Docusaurus documentation site at `docs.labrota.app` covering all features with by_shift / by_task content variants

---

## 4. Non-Functional Requirements

### 4.1 Performance

- **NFR-PRF-01** Schedule page first load (with server-side prefetch): < 1.5 s to interactive on 50 Mbps connection
- **NFR-PRF-02** Week navigation (cached): < 100 ms (client-side cache, no network round-trip)
- **NFR-PRF-03** Week navigation (uncached): < 2 s to data displayed
- **NFR-PRF-04** Algorithmic rota generation (v1/v2): < 5 s
- **NFR-PRF-05** Hybrid generation (v2 + Claude review): < 60 s
- **NFR-PRF-06** Full Claude reasoning generation: < 300 s (Vercel max duration)
- **NFR-PRF-07** AI chat response: first token < 2 s; stream to completion
- **NFR-PRF-08** Client-side week cache survives page navigation (window-pinned singleton); adjacent weeks pre-fetched on idle

### 4.2 Security

- **NFR-SEC-01** All server actions and API routes must call `supabase.auth.getUser()` before any DB read or write
- **NFR-SEC-02** Admin-only actions must additionally call `assertSuperAdmin()`; editor-only actions must call `requireEditor()`
- **NFR-SEC-03** Row Level Security enforced on all tables via Supabase RLS; no org can access another org's data
- **NFR-SEC-04** Logo URLs must be HTTPS; validated before DB write
- **NFR-SEC-05** User role in inviteOrgUser validated against an allowlist (admin, manager, viewer)
- **NFR-SEC-06** No `dangerouslySetInnerHTML` anywhere in the codebase
- **NFR-SEC-07** All user inputs validated at system boundaries; server actions use Zod schemas
- **NFR-SEC-08** Outlook OAuth tokens encrypted at the application layer before storage
- **NFR-SEC-09** Service-role (admin) Supabase client used only in super admin actions; never in clinic-facing actions
- **NFR-SEC-10** AI chat rate-limited to 20 requests/minute per user

### 4.3 Reliability

- **NFR-REL-01** Production deployments auto-deployed from `main` branch via Vercel; no manual deployment steps
- **NFR-REL-02** Rota generation timeouts produce a clear user-facing error; no silent failures
- **NFR-REL-03** Client-side week fetch races with a 15-second timeout; staff fetch times out at 15 seconds
- **NFR-REL-04** All data-fetching routes must have `loading.tsx` skeleton and `error.tsx` boundary

### 4.4 Scalability

- **NFR-SCA-01** Multi-tenant: unlimited organisations, each with up to 50 staff by default (configurable)
- **NFR-SCA-02** No cross-tenant queries; RLS enforces isolation at the DB layer
- **NFR-SCA-03** Stateless server actions; no in-process state between requests

### 4.5 Internationalisation

- **NFR-I18N-01** All user-facing strings in `messages/es.json` and `messages/en.json`; no hardcoded UI text
- **NFR-I18N-02** Locale stored in a cookie; switching locale does not change URL
- **NFR-I18N-03** Date formatting always via `lib/format-date.ts`; never `.toLocaleDateString()` directly
- **NFR-I18N-04** Server action error messages may be hardcoded English (internal convention)

### 4.6 Accessibility & Design

- **NFR-A11Y-01** Two type sizes only: 14px body/labels, 18px headings (small labels: 10–12px)
- **NFR-A11Y-02** Design tokens from CSS variables defined in `app/globals.css`; no inline colour literals
- **NFR-A11Y-03** No gradients, no heavy shadows; 1px borders at `#CCDDEE`; 12px card radius; 8px spacing grid
- **NFR-A11Y-04** Empty states always use `<EmptyState>` component; loading states always use skeleton components — never spinners or blank divs

### 4.7 Maintainability

- **NFR-MNT-01** TypeScript strict mode; no `as any`; proper types or `as never` for admin client inserts
- **NFR-MNT-02** Unit tests (Vitest) for rota engine, task engine, middleware routing, date formatting, leave file parsing
- **NFR-MNT-03** E2E smoke tests (Playwright) for all pages on each push
- **NFR-MNT-04** Tests must pass before merging to `main`
- **NFR-MNT-05** Component patterns: `render={<Link />}` for button-as-link (base-ui, not Radix `asChild`); `<Badge variant="lab|andrology|admin">` for role badges

### 4.8 Data & Privacy

- **NFR-DAT-01** All data stored in Supabase PostgreSQL (Frankfurt region); no PII outside EU
- **NFR-DAT-02** Supabase magic link / OTP for authentication; no passwords stored unless org opts in to password auth
- **NFR-DAT-03** Audit log records all write actions with actor, timestamp, resource, and details
- **NFR-DAT-04** Staff can be soft-deleted (status = inactive) or hard-deleted; hard delete removes all associated data

---

## 5. Out of Scope (current version)

- Native mobile apps (iOS / Android)
- Push notifications
- Payroll integration
- Multi-language beyond ES / EN
- Rota for non-IVF departments (e.g. nursing, anaesthetics)
- Self-service leave requests (viewer-initiated, manager-approved flow) — feature-flagged, not yet built
- Public-facing shift visibility (staff-facing app beyond the web viewer)
