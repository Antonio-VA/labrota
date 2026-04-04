# LabRota — Architecture

AI-powered staff scheduling SaaS for IVF embryology labs.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         Vercel Edge                              │
│  ┌────────────┐  ┌─────────────┐  ┌───────────────────────────┐ │
│  │ middleware  │→ │  Next.js 16 │→ │    Server Components      │ │
│  │ (auth gate)│  │  App Router │  │    + Server Actions        │ │
│  └────────────┘  └─────────────┘  └───────────┬───────────────┘ │
│                                                │                 │
│  ┌────────────────────────────────────────────┐│                 │
│  │         Client Components (React 19)       ││                 │
│  │         React Compiler enabled             ││                 │
│  └────────────────────────────────────────────┘│                 │
└────────────────────────────────────────────────┼─────────────────┘
                                                 │
                    ┌────────────────────────────┐│
                    │                            ││
               ┌────▼────┐              ┌────────▼────────┐
               │ Supabase │              │  Anthropic API  │
               │ Postgres │              │  Claude Sonnet  │
               │ + Auth   │              │  (AI assistant  │
               │ + RLS    │              │   + rota gen)   │
               └──────────┘              └─────────────────┘
```

---

## Multi-Tenant Model

Every table has `organisation_id` enforced by RLS via `auth_organisation_id()`. Users belong to organisations through `organisation_members` (roles: admin, manager, viewer). Super admins access the admin portal on `admin.labrota.app`.

```
organisations
  ├── profiles (auth users)
  ├── organisation_members (role-based access)
  ├── staff (clinic employees — not auth users)
  ├── departments
  ├── shift_types
  ├── tecnicas (lab techniques/tasks)
  ├── lab_config (per-org settings)
  ├── leaves
  ├── rotas → rota_assignments
  ├── rota_rules
  ├── rota_templates
  └── audit_logs
```

---

## Request Flow

### Page Load (Server Component)
```
Browser → middleware.ts (refresh session, check auth/role)
       → app/(clinic)/page.tsx (server component)
       → createClient() (Supabase with RLS)
       → render HTML → stream to client
```

### Mutation (Server Action)
```
Client component → server action (app/(clinic)/*/actions.ts)
       → supabase.auth.getUser() (explicit auth check)
       → getOrgId() (org scoping via RLS)
       → DB mutation
       → revalidatePath("/")
```

### AI Chat
```
Client (useChat from @ai-sdk/react)
       → POST /api/chat/route.ts
       → convertToModelMessages() + streamText()
       → Claude Sonnet 4.6 with tools (propose/confirm pattern)
       → result.toUIMessageStreamResponse()
```

---

## Rota Generation Architecture

Five generation strategies, routed by the UI strategy modal:

| Strategy | Engine | Claude | Description |
|----------|--------|--------|-------------|
| Template | — | No | Copy from saved template (strict or flexible) |
| AI Optimal v1 | `rota-engine.ts` | No | Original algorithm: assign all + apply rules |
| AI Optimal v2 | `rota-engine-v2.ts` | No | L1/L2/L3 constraint hierarchy |
| Hybrid | `rota-engine-v2.ts` | Yes | v2 base rota → Claude reviews and optimises |
| Claude Reasoning | — | Yes | Claude generates from scratch with step-by-step reasoning |

### Engine Architecture (v1 & v2)

```
Phase 1: Reserve minimum coverage for all 7 days
  → For each day: reserve lab, andrology, admin staff for coverage minimums
  → Budget-aware: reserved < days_per_week
  → working_pattern filter: only reserve for days staff can work

Phase 2: Day-by-day assignment
  → Reserved staff always assigned (Phase 1 guarantee)
  → Remaining staff added if hasBudget() passes
  → Scheduling rules applied (max consecutive, weekend distribution, etc.)
  → Shift distribution (technique alignment, rotation, avoid preferences)
  → Final coverage warnings emitted after all passes
```

**v2 difference**: L1 constraints (budget, coverage) can never be broken by L2 rules. v1 only checks budget before removing.

### Hybrid Flow
```
1. Run engine v2 → valid base rota
2. Serialise rota + context for Claude
3. Claude reviews: avoid_days, fairness, rule compliance
4. Validate Claude's changes against days_per_week (not engine output)
5. Recalculate coverage warnings from final assignments
6. Save with reasoning + warnings
```

---

## Key Data Flows

### Schedule View (main page)
```
getRotaWeek(weekStart)
  → Parallel: rota, lab_config, leaves, staff, assignments, shift_types,
    tecnicas, departments, rules, punctions
  → Compute: publicHolidays (date-holidays lib, country+region aware)
  → Return: RotaWeekData (days, assignments, shifts, coverage, holidays)
```

### Month View (4-week calendar)
```
getRotaMonthSummary(monthStart)
  → 28-day grid with per-day: staff count, status, holidays
  → Week statuses (draft/published)
  → Staff totals for shift budget bar
```

---

## Authentication

```
/login  → Magic link (OTP) — production users
/demo   → Email + password — demo/testing only
/admin  → Magic link — super_admin role required
```

Middleware (`middleware.ts`):
- Refreshes Supabase session on every request
- Admin subdomain (`admin.labrota.app`) → rewrites to `/admin/*`
- PKCE code params on any route → redirects to `/auth/callback`
- Unauthenticated → `/login`
- Super admin on `/` → `/admin`

---

## File Architecture

```
app/
  layout.tsx              Root: NextIntlClientProvider + TooltipProvider
  (clinic)/               Route group — sidebar layout
    layout.tsx            SidebarProvider + AppSidebar + MobileBottomNav
    page.tsx              Schedule (calendar + AI chat)
    lab/page.tsx          Lab config (8 tabs)
    staff/page.tsx        Team management
    leaves/page.tsx       Leave management
    reports/page.tsx      Report generation
    settings/page.tsx     Org settings (6 tabs)
    rota/actions.ts       ★ Main server actions (generation, assignments, etc.)
  admin/                  Super admin portal
    page.tsx              Org list + stats
    orgs/[id]/page.tsx    Org detail + user management
  auth/callback/          Magic link + PKCE exchange
  login/                  Magic link login
  demo/                   Password login

components/               82 client components
  calendar-panel.tsx      ★ Largest file (~6000 lines) — schedule views,
                           staff panel, day view, generation modal
  assignment-sheet.tsx    Day detail panel (slide-over)
  app-sidebar.tsx         Navigation sidebar
  leaves-list.tsx         Leave management UI
  rules-section.tsx       Scheduling rules config
  ui/                     Design system primitives (base-ui + shadcn)

lib/
  rota-engine.ts          Scheduling engine v1
  rota-engine-v2.ts       Scheduling engine v2 (L1/L2/L3)
  task-engine.ts          Task-mode scheduling engine
  export-pdf.ts           PDF export (jsPDF)
  export-excel.ts         Excel export (xlsx-js-style)
  share-capture.ts        Image capture for sharing
  format-date.ts          ★ Date formatting (always use this, never toLocaleDateString)
  regional-config.ts      Country/region definitions + holiday state mapping
  supabase/               Client, server, admin Supabase clients
  types/database.ts       All DB types + Database interface

messages/
  es.json                 Spanish (default locale)
  en.json                 English

supabase/
  migrations/             20+ migration files
```

---

## External Dependencies

| Service | Purpose | Config |
|---------|---------|--------|
| Supabase (Frankfurt) | Postgres + Auth + RLS | `NEXT_PUBLIC_SUPABASE_URL` |
| Anthropic API | AI chat + rota generation | `ANTHROPIC_API_KEY` |
| Vercel | Hosting + Edge | Auto-deployed from `main` |
| date-holidays | Public holiday data (200+ countries) | npm package, no API key |

---

## Mobile Strategy

Desktop-first (1280px+). Breakpoint: `md` (768px).

- **Schedule**: Full mobile support — bottom nav, day view, AI chat tab
- **All other pages**: `<MobileGate>` shows "use desktop" message
- Sidebar hidden on mobile (no Sheet trigger)
- `<MobileBottomNav>` for mobile navigation
