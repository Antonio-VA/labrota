# LabRota — Feature Tracker

Living document. Updated as features are built.

Last updated: 2026-04-04

---

## Legend

- ✅ Done — shipped to production
- 🚧 In progress
- 📋 Planned — scoped but not started
- 💡 Idea — not yet scoped

---

## Core Platform

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-tenant architecture | ✅ | RLS on all tables, org-scoped |
| Magic link auth | ✅ | `/login` — OTP + code entry |
| Password auth (demo) | ✅ | `/demo` — for testing/demos only |
| Super admin portal | ✅ | `admin.labrota.app` subdomain |
| i18n (ES/EN) | ✅ | Cookie-based, `next-intl` v4 |
| Mobile schedule view | ✅ | Day view + AI chat tab |
| Mobile gate (other pages) | ✅ | Desktop-only message |
| React Compiler | ✅ | `babel-plugin-react-compiler` |
| Error boundaries | ✅ | `error.tsx` on all route groups |
| Loading skeletons | ✅ | `loading.tsx` on all data routes |
| Dark mode | ✅ | Auto/light/dark via account panel |
| Accent colours | ✅ | 10 colour palette |
| Font scaling | ✅ | Small/normal/large |
| PWA manifest | ✅ | `public/manifest.json` |

## Schedule

| Feature | Status | Notes |
|---------|--------|-------|
| Week view (by shift) | ✅ | Primary view — shift grid with staff pills |
| Week view (by person) | ✅ | PersonGrid — transposed rows/columns |
| 4-week calendar | ✅ | Monthly overview with coverage + holidays |
| Day panel | ✅ | Slide-over with staff grouped by shift |
| Staff profile panel | ✅ | Skills, debt, preferences, leaves |
| Drag-and-drop editing | ✅ | Move assignments between cells |
| Shift highlight | ✅ | Toggle highlight for a specific shift |
| P+B coverage index | ✅ | Punctions + biopsies / staff ratio |
| Public holidays | ✅ | Regional via `date-holidays` (200+ countries) |
| Weekly notes | ✅ | Per-week notes + note templates |
| Publish / unpublish rota | ✅ | Draft → published workflow |
| Copy previous week | ✅ | Quick duplicate |
| Staff colour chips | ✅ | Toggle personal colour borders |
| Department colour borders | ✅ | Toggle role colour on pills |
| Favourite view | ✅ | Save/restore layout preferences |
| Compact mode (mobile) | ✅ | Smaller staff pills |
| Share/copy image | ✅ | Capture rota as PNG |

## Rota Generation

| Feature | Status | Notes |
|---------|--------|-------|
| Template (strict) | ✅ | Copy from saved template exactly |
| Template (flexible) | ✅ | Copy template respecting leaves |
| AI Optimal v1 | ✅ | Assign all + apply rules |
| AI Optimal v2 | ✅ | L1/L2/L3 constraint hierarchy |
| Hybrid (v2 + Claude) | ✅ | Engine base → Claude optimises |
| Claude Reasoning | ✅ | Full Claude generation |
| AI Insights | ✅ | View Claude's reasoning (purple button) |
| Regenerate single day | ✅ | Without regenerating full week |
| Per-org engine config | ✅ | v1/v2 selection + strategy toggles |
| Task engine | ✅ | by_task mode: assign staff to técnicas |

## AI Assistant

| Feature | Status | Notes |
|---------|--------|-------|
| Chat panel | ✅ | Integrated in schedule view |
| Generate rota via chat | ✅ | Tool: generateRota |
| Upsert assignments | ✅ | Tool: upsertAssignment |
| Regenerate day via chat | ✅ | Tool: regenerateDay |
| Publish/unlock via chat | ✅ | Tool: publishRota / unlockRota |
| Suggested prompts | ✅ | 3 starter prompts |

## Staff Management

| Feature | Status | Notes |
|---------|--------|-------|
| Staff list with filters | ✅ | By role, status, skills |
| Staff profile page | ✅ | Full edit form |
| Skill management | ✅ | Certified / training / not trained |
| Working pattern | ✅ | Available days selector |
| Day preferences | ✅ | 3-state: neutral → prefer → avoid |
| Shift preferences | ✅ | Multi-select preferred + avoid |
| Staff colours | ✅ | Personal colour for grid highlighting |
| Import wizard | ✅ | Excel/CSV bulk import |
| Rota import | ✅ | Import historical rotas from file |

## Leave Management

| Feature | Status | Notes |
|---------|--------|-------|
| Leave list with KPIs | ✅ | Absent today, this week, upcoming, pending |
| Leave types | ✅ | Annual, sick, personal, training, maternity, other |
| Status workflow | ✅ | Pending → approved / rejected / cancelled |
| Quick-create from panel | ✅ | Inline leave form in staff panel |
| Leave requests (viewer) | ✅ | Toggle per-org |
| File-based import | ✅ | Parse leave dates from Excel/CSV |
| Impact notifications | ✅ | Alert when leave affects published rota |
| Leave review tracking | ✅ | Reviewer name + timestamp |

## Lab Configuration

| Feature | Status | Notes |
|---------|--------|-------|
| Departments | ✅ | Name, abbreviation, colour, sort order |
| Shift types | ✅ | Code, times, active days |
| Técnicas (tasks) | ✅ | Code, department, typical shifts |
| Coverage (by shift) | ✅ | Per-shift per-day per-role minimums |
| Coverage (by task) | ✅ | Per-task per-day minimums |
| Workload (punctions) | ✅ | Per-day forecast + biopsy conversion |
| Generator settings | ✅ | Days-off pref, shift rotation mode |
| Scheduling rules | ✅ | 13 rule types, hard/soft, expiry |
| Templates | ✅ | Save/apply rota templates |
| Weekly note templates | ✅ | Default notes per week |

## Reports & Export

| Feature | Status | Notes |
|---------|--------|-------|
| Staff summary report | ✅ | Shift distribution + leaves per person |
| Task coverage report | ✅ | Technique coverage (task mode only) |
| Extra days report | ✅ | Staff above contract hours |
| Confirmed leaves report | ✅ | Approved leaves for period |
| PDF export | ✅ | Weekly rota (by shift / by person) |
| Excel export | ✅ | Shift distribution spreadsheet |
| Image share/copy | ✅ | PNG capture of rota view |

## Admin Portal

| Feature | Status | Notes |
|---------|--------|-------|
| Organisation list | ✅ | With stats + status |
| Create organisation | ✅ | Name, slug, initial config |
| Org detail + users | ✅ | User management, role assignment |
| Regional config | ✅ | Country + region (holidays) |
| Engine config per org | ✅ | v1/v2 + strategy toggles |
| Data backup/restore | ✅ | Full org backup to JSON |
| History import | ✅ | Import historical data |
| Implementation tracker | ✅ | Onboarding progress per org |
| Audit log viewer | ✅ | Action history per org |

## Settings (Clinic)

| Feature | Status | Notes |
|---------|--------|-------|
| Organisation name + logo | ✅ | Editable with icon upload |
| Regional config | ✅ | Country + region selector |
| Feature toggles | ✅ | Leave requests, notes, task-in-shift |
| User management | ✅ | Invite, roles, linked staff |
| Implementation steps | ✅ | Guided setup checklist |
| Audit log | ✅ | Action history |
| Account panel | ✅ | Language, theme, accent, font, time format |

---

## Planned / Ideas

| Feature | Status | Notes |
|---------|--------|-------|
| Marketing website | 📋 | Root domain landing page |
| Billing / Stripe | 📋 | Subscription management |
| Email notifications | 💡 | Rota published, shift changes |
| Push notifications | 💡 | Mobile PWA push |
| Staff self-service | 💡 | Swap requests, availability |
| Overtime tracking | 💡 | Hours vs contract |
| Analytics dashboard | 💡 | Coverage trends, fairness metrics |
| Multi-site support | 💡 | Staff shared across locations |
| API for integrations | 💡 | REST/GraphQL for external systems |
| Onboarding wizard v2 | 💡 | Guided setup from scratch |
