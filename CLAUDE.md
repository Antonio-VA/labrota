# LabRota — Claude Code Guide

AI-powered staff scheduling SaaS for IVF embryology labs.
Single Spanish clinic is the initial user. Multi-tenant architecture from day one.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + shadcn/ui (base-ui variant) |
| Auth | Supabase magic link (`@supabase/ssr`) |
| Database | Supabase (PostgreSQL, Frankfurt) |
| AI | Vercel AI SDK v6 + Claude Sonnet 4.6 |
| i18n | next-intl v4 (cookie-based, no URL prefix) |
| Icons | Lucide React |
| Font | Geist (variable, loaded via `next/font/google`) |

---

## Folder Structure

```
app/
  admin/              Super admin portal (admin.labrota.app)
    layout.tsx        Checks app_metadata.role === 'super_admin'
    page.tsx          Org list + stats
    actions.ts        Server actions (createOrg, toggleStatus, createUser)
    orgs/new/         Create org form
    orgs/[id]/        Org detail + user management
  auth/callback/      Magic link exchange → session
  design-system/      Dev-only component showcase
  login/              Magic link login page
  (clinic)/           Route group — shared sidebar layout (ClinicLayout)
    layout.tsx        SidebarProvider + AppSidebar + SidebarInset shell
    page.tsx          Schedule (calendar + AI chat, mobile tab switching)
    lab/
      page.tsx        Lab configuration form
      actions.ts      updateLabConfig server action
  globals.css         LabRota design tokens (CSS variables)
  layout.tsx          Root layout — NextIntlClientProvider + TooltipProvider

components/
  app-sidebar.tsx     Pinned 240px sidebar with nav + UserMenu + LanguageToggle
  user-menu.tsx       Avatar, display name, sign-out
  language-toggle.tsx ES ↔ EN switcher (sets cookie, router.refresh)
  admin-sign-out.tsx  Sign-out button for admin portal
  admin-add-user-form.tsx  Client form for creating org users
  ui/                 Design system primitives (base-ui + shadcn)
    badge.tsx         Includes role/status variants: lab, andrology, admin, skill-gap, active, inactive
    button.tsx        base-ui Button — use render prop NOT asChild
    card.tsx          LabRota card (12px radius, CCDDEE border)
    empty-state.tsx   Icon + title + description + optional CTA
    page-header.tsx   18px title + description + actions slot
    skeleton.tsx      Skeleton, TableRowSkeleton, TableSkeleton, CardSkeleton

i18n/
  request.ts          Reads 'locale' cookie (defaults 'es'), loads messages

lib/
  format-date.ts      formatDate / formatDateWithYear / formatDateRange — always use these, never toLocaleDateString
  utils.ts            cn(), generateSlug()
  supabase/
    client.ts         createBrowserClient<Database> — client components
    server.ts         createServerClient<Database> — server components / actions
    admin.ts          Plain (untyped) createClient — service role, bypasses RLS
  locale-action.ts    setLocale() server action — sets locale cookie
  types/
    database.ts       All DB types + Database interface

messages/
  es.json             Spanish strings (default locale)
  en.json             English strings

scripts/
  create-super-admin.ts  One-time: creates ton_va@outlook.com as super admin

supabase/
  migrations/
    20260317000001_initial_schema.sql   Full schema — run in Supabase SQL editor
```

---

## Component Structure

**Keep client components under ~300 lines.** When a file grows past that — or when it has more than ~3 distinct UI sections / sub-components — split it on the first pass, not later.

**Folder pattern** (used by `staff-form`, `calendar-panel`, `assignment-sheet`, `lab-config-form`, `admin-org-detail-client`):

```
components/<name>/
  index.tsx         Thin orchestrator — state + dispatch to sections
  shared.tsx        Types + small reusable bits (rows, toggles, helpers)
  <section>.tsx     One file per section / sub-component
```

**Page-level split** (used by `app/(marketing)/`):

```
app/<group>/
  page.tsx          Orchestrator
  _sections/        Underscore prefix keeps it out of route discovery
    content.ts      Static content / i18n blobs
    <section>.tsx   One file per section
```

**Rules of thumb:**
- State that only one section uses → declare it inside that section, not in the orchestrator.
- Don't widen literal types with `as const` on multi-locale content objects — it makes the per-language shapes incompatible.
- Extract recurring inline UI (stepper inputs, number rows, toggle rows) into a local helper in `shared.tsx` rather than copy-pasting.

---

## Design System

Follow this on every new component:

> Clinical white backgrounds (`#FFFFFF`), blue accent (`#1B4F8A`), Geist typeface at **14px/400** and **18px/500 only**, 8px base spacing grid, 12px border radius on cards, 1px borders at `#CCDDEE`, no gradients, no heavy shadows.
> Role colours: Lab = `#2563EB`, Andrology = `#059669`, Admin = `#64748B`. Skill gap indicators = `#EF4444` only.
> Empty states and loading skeletons required on every list view.

### Typography — two sizes only
- Body / labels: `text-[14px] font-normal` or `font-medium`
- Headings: `text-[18px] font-medium`

### CSS variables (defined in `app/globals.css`)
- `--primary: #1b4f8a`
- `--border: #ccddee`
- `--destructive: #ef4444`
- `--role-lab: #2563eb`
- `--role-andrology: #059669`
- `--role-admin: #64748b`
- `--accent: #dbeafe` (active nav background)
- `--accent-foreground: #1e40af` (active nav text)

---

## Responsive Strategy

Desktop-first. Optimised for 1280px+. Breakpoint: `md` (768px).

| Section | Desktop | Mobile |
|---|---|---|
| Schedule | Sidebar + week/month/day calendar + AI chat panel | Bottom nav, day view only, AI chat via "AI" tab |
| Team / Leaves / Lab / Reports / Settings | Full layout | `<MobileGate>` — "Please use a desktop browser" |
| Admin portal | Desktop only | Not applicable (no mobile support) |

### Mobile layout rules
- Sidebar hidden on mobile (`md:block` via shadcn sidebar internals — Sheet never triggered)
- `<MobileBottomNav>` renders at bottom of `SidebarInset` — `md:hidden`
- Schedule page: `mobileTab` state switches between `"schedule"` and `"chat"` views
- AI chat takes full screen when active on mobile (`flex flex-1` instead of `w-80`)
- `<MobileGate>` wraps all non-schedule page content — shows monitor icon + message on mobile

### Components
- `components/mobile-bottom-nav.tsx` — `MobileBottomNav` + exported `MobileTab` type
- `components/mobile-gate.tsx` — `MobileGate` wrapper for desktop-only sections

---

### Key component patterns
- **Button as link**: use `render={<Link href="..." />}` — NOT `asChild` (this is base-ui, not Radix)
- **Role badge**: `<Badge variant="lab">`, `<Badge variant="andrology">`, `<Badge variant="admin">`
- **Skill gap**: `<Badge variant="skill-gap">` — red only, never use for anything else
- **Status**: `<Badge variant="active">` / `<Badge variant="inactive">`
- **Empty lists**: always render `<EmptyState>` — never a blank div
- **Loading**: always render `<TableSkeleton>` or `<CardSkeleton>` — never a spinner

---

## Date Formatting

**Always use `lib/format-date.ts`. Never use `.toLocaleDateString()` directly.**

```ts
import { formatDate, formatDateWithYear, formatDateRange } from "@/lib/format-date"
const locale = useLocale() // client  OR  await getLocale() // server

formatDate("2026-03-17", locale)           // Mon 17 Mar / lun 17 mar
formatDateWithYear("2026-03-17", locale)   // Mon 17 Mar 2026 / lun 17 mar 2026
formatDateRange(start, end, locale)        // Mon 17 Mar – Wed 19 Mar 2026
```

Use `formatDateWithYear` in: leave lists, rota history, admin stats tables.
Use `formatDate` in: week view headers, schedule cells, inline references.

---

## i18n

- Locale stored in `locale` cookie, read in `i18n/request.ts`
- Default: `es` (Spanish)
- All UI strings must come from `messages/es.json` + `messages/en.json`
- Server components: `const t = await getTranslations("namespace")`
- Client components: `const t = useTranslations("namespace")`

**Namespaces:** `common`, `nav`, `auth`, `schedule`, `staff`, `skills`, `leaves`, `lab`, `reports`, `settings`, `agent`, `pdf`, `errors`

---

## Authentication

- **Clinic app**: magic link → `/auth/callback` → session cookie
- **Super admin**: same magic link flow, but `app_metadata.role === "super_admin"` required
- Middleware (`middleware.ts`) enforces role-based routing:
  - `/admin/*` → requires `super_admin`
  - All other routes → requires any authenticated user
  - Super admin visiting `/` → redirected to `/admin`

---

## Database

- All tables have `organisation_id` — RLS enforced via `auth_organisation_id()` helper
- **Never** query without RLS unless using `createAdminClient()` (service role)
- `createAdminClient()` is **untyped** — cast results to types from `lib/types/database.ts`
- Migration at `supabase/migrations/20260317000001_initial_schema.sql`

### Tables
`organisations` · `profiles` · `staff` · `staff_skills` · `leaves` · `rotas` · `rota_assignments` · `lab_config` · `shift_types` · `departments` · `tecnicas`

### Shift-Task Linking (by_task mode)

Tasks are explicitly assigned to shifts via `tecnicas.typical_shifts string[]`.

**Data model:**
- `tecnicas.typical_shifts` — array of shift codes where this task occurs (empty = all shifts)
- `staff.preferred_shift` — determines which shift a staff member belongs to; used to scope staff selectors
- `shift_types.department_codes` — deprecated column (kept for DB compat), no longer used for filtering

**UI:**
- **Tasks tab** — binary toggle buttons per shift (select/unselect) when >1 active shift
- **Coverage tab** — all departments shown under every active shift; coverage minimums set per shift + department + day
- **Task grid** — tasks grouped under shift subheaders based on `typical_shifts`; tasks in multiple shifts appear in each; staff selector scoped by `preferred_shift` and cross-shift exclusion
- **Staff form** — all active shifts shown for preference selection (no department filtering)

**Engine behaviour:**
- `task-engine.ts` resolves shift from `typical_shifts` first, falls back to dummy shift
- `preferred_shift` is a soft preference in candidate sorting
- Staff filtered by the task's own department (not by shift)
- Assignments get the correct `shift_type` based on the task's typical_shifts

---

## AI SDK (Vercel AI SDK v6)

- Client: `useChat` from `@ai-sdk/react` — uses `sendMessage({ text })` and `status` (not `handleSubmit`/`isLoading`)
- Messages: read from `message.parts` (not `.content`)
- Server route: `convertToModelMessages(messages)` → `streamText` → `result.toUIMessageStreamResponse()`
- Agent write operations always use draft-confirm pattern before saving

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
ANTHROPIC_API_KEY=
```

`.env.local` is never committed. Create it manually.

---

## Git

- **Always commit and push directly to `main`** (production branch) — no exceptions
- Never create or push to feature branches unless the user explicitly requests it
- If the harness or CI tries to use a feature branch, override it and push to `main` instead

---

## Testing

**After any feature change, update the corresponding tests.** Tests must pass before pushing.

### Unit tests (Vitest)
```bash
npx vitest run
```
- `lib/__tests__/rota-engine-v2.test.ts` — rota generation logic (by-shift engine v2)
- `lib/__tests__/task-engine.test.ts` — task-based engine logic
- `lib/__tests__/middleware.test.ts` — auth routing (public paths, login, admin, subdomain)
- `lib/__tests__/format-date.test.ts` — date formatting helpers
- `lib/__tests__/parse-leave-file.test.ts` — leave file parsing

### E2E tests (Playwright)
```bash
npx playwright test
```
- `e2e/auth.setup.ts` — authenticates as demo user
- `e2e/smoke.spec.ts` — smoke tests for all pages (schedule, staff, leaves, lab, reports, settings)

### When to update tests
- Changed middleware routing? → update `middleware.test.ts`
- Changed rota engine logic? → update `rota-engine-v2.test.ts`
- Changed date formatting? → update `format-date.test.ts`
- Added/removed pages or changed page content? → update `smoke.spec.ts`
- Changed auth flow? → update `auth.setup.ts`

---

## Build Order (remaining)

| Step | Feature | Status |
|---|---|---|
| 2 | Design system | ✅ |
| 3 | i18n | ✅ |
| 4 | Auth | ✅ |
| 5 | Database | ✅ |
| 6 | Super admin portal | ✅ |
| 7 | Lab config | ✅ |
| 8 | Team (staff management) | ✅ |
| 9 | Leaves | ✅ |
| 10 | Rota generation | ✅ |
| 11 | Schedule views | ✅ |
| 12 | PDF export | ✅ |
| 13 | AI agent | ✅ |
