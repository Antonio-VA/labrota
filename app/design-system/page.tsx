"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton, TableSkeleton, CardSkeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  FlaskConical,
  Users,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Download,
} from "lucide-react"

// ------------------------------------------------------------------ //
// Section wrapper
// ------------------------------------------------------------------ //
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[18px] font-medium border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

// ------------------------------------------------------------------ //
// Colour swatches
// ------------------------------------------------------------------ //
const swatches = [
  { name: "Primary — #1B4F8A", bg: "bg-primary", text: "text-primary-foreground" },
  { name: "Background — #FFFFFF", bg: "bg-background border border-border", text: "text-foreground" },
  { name: "Muted — #F8FAFC", bg: "bg-muted border border-border", text: "text-muted-foreground" },
  { name: "Border — #CCDDEE", bg: "bg-border", text: "text-foreground" },
  { name: "Accent — #DBEAFE", bg: "bg-accent", text: "text-accent-foreground" },
  { name: "Destructive — #EF4444", bg: "bg-destructive", text: "text-white" },
]

const roleSwatches = [
  { name: "Lab — #2563EB", bg: "bg-blue-600", text: "text-white" },
  { name: "Andrology — #059669", bg: "bg-emerald-600", text: "text-white" },
  { name: "Admin — #64748B", bg: "bg-slate-500", text: "text-white" },
]

// ------------------------------------------------------------------ //
// Page
// ------------------------------------------------------------------ //
export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Design System"
        description="LabRota visual language — clinical, precise, reassuring."
        actions={
          <Badge variant="secondary">v1</Badge>
        }
      />

      <div className="flex flex-col gap-12 px-6 py-8 max-w-4xl">

        {/* ---- Colours ---- */}
        <Section title="Colours">
          <Row label="Base palette">
            {swatches.map((s) => (
              <div key={s.name} className="flex flex-col gap-1.5">
                <div className={`size-12 rounded-lg ${s.bg}`} />
                <p className="text-[14px] text-muted-foreground w-40">{s.name}</p>
              </div>
            ))}
          </Row>
          <Row label="Role colours">
            {roleSwatches.map((s) => (
              <div key={s.name} className="flex flex-col gap-1.5">
                <div className={`size-12 rounded-lg ${s.bg}`} />
                <p className="text-[14px] text-muted-foreground w-44">{s.name}</p>
              </div>
            ))}
          </Row>
        </Section>

        {/* ---- Typography ---- */}
        <Section title="Typography">
          <Row label="Geist — 18px / 500 (headings)">
            <p className="text-[18px] font-medium">
              Embryology lab scheduling
            </p>
          </Row>
          <Row label="Geist — 14px / 400 (body)">
            <p className="text-[14px] font-normal">
              Staff are scheduled based on contracted working days and skill coverage requirements.
            </p>
          </Row>
          <Row label="14px / 500 (label / emphasis)">
            <p className="text-[14px] font-medium">Ana García · Lab Scientist</p>
          </Row>
          <Row label="14px / 400 muted (secondary text)">
            <p className="text-[14px] text-muted-foreground">Last updated 2 hours ago</p>
          </Row>
        </Section>

        {/* ---- Buttons ---- */}
        <Section title="Buttons">
          <Row label="Variants">
            <Button variant="default">
              <Plus />
              Add Staff
            </Button>
            <Button variant="outline">
              <Download />
              Export PDF
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
          </Row>
          <Row label="Sizes">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" variant="outline">
              <Plus />
            </Button>
          </Row>
          <Row label="Disabled">
            <Button disabled>Disabled</Button>
            <Button variant="outline" disabled>Disabled outline</Button>
          </Row>
        </Section>

        {/* ---- Badges ---- */}
        <Section title="Badges">
          <Row label="Role badges">
            <Badge variant="lab">Lab</Badge>
            <Badge variant="andrology">Andrology</Badge>
            <Badge variant="admin">Admin</Badge>
          </Row>
          <Row label="Status badges">
            <Badge variant="active">Active</Badge>
            <Badge variant="inactive">Inactive</Badge>
          </Row>
          <Row label="Skill gap (red only per spec)">
            <Badge variant="skill-gap">
              <AlertTriangle />
              ICSI gap
            </Badge>
            <Badge variant="skill-gap">
              <AlertTriangle />
              IUI gap
            </Badge>
          </Row>
          <Row label="Skill pills (standard)">
            <Badge variant="secondary">ICSI</Badge>
            <Badge variant="secondary">IUI</Badge>
            <Badge variant="secondary">Vitrification</Badge>
            <Badge variant="secondary">Andrology</Badge>
          </Row>
          <Row label="System">
            <Badge variant="default">Published</Badge>
            <Badge variant="outline">Draft</Badge>
            <Badge variant="destructive">Error</Badge>
          </Row>
        </Section>

        {/* ---- Form inputs ---- */}
        <Section title="Form Inputs">
          <Row label="Text input">
            <Input className="w-64" placeholder="Search staff…" />
          </Row>
          <Row label="Disabled">
            <Input className="w-64" placeholder="Not editable" disabled />
          </Row>
        </Section>

        {/* ---- Cards ---- */}
        <Section title="Cards">
          <Row label="Standard card">
            <Card className="w-72">
              <CardHeader>
                <CardTitle>Week of 17 Mar</CardTitle>
                <CardDescription>5 shifts scheduled · 2 on leave</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Badge variant="lab">Lab</Badge>
                  <Badge variant="andrology">Andrology</Badge>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm" variant="outline">View rota</Button>
                <Button size="sm">Export PDF</Button>
              </CardFooter>
            </Card>
          </Row>
          <Row label="Stat card">
            <Card className="w-48">
              <CardContent className="py-6">
                <p className="text-[14px] text-muted-foreground">Active staff</p>
                <p className="text-[18px] font-medium mt-1">12</p>
                <p className="text-[14px] text-muted-foreground mt-1">3 on leave this week</p>
              </CardContent>
            </Card>
            <Card className="w-48">
              <CardContent className="py-6">
                <p className="text-[14px] text-muted-foreground">Rotas generated</p>
                <p className="text-[18px] font-medium mt-1">47</p>
                <p className="text-[14px] text-muted-foreground mt-1">Last 30 days: 8</p>
              </CardContent>
            </Card>
          </Row>
        </Section>

        {/* ---- Empty states ---- */}
        <Section title="Empty States">
          <Row label="Staff list — no results">
            <div className="w-full rounded-lg border border-border">
              <EmptyState
                icon={Users}
                title="No staff members yet"
                description="Add your first team member to start scheduling rotas."
                action={{ label: "Add staff member", onClick: () => {} }}
              />
            </div>
          </Row>
          <Row label="Schedule — no rota generated">
            <div className="w-full rounded-lg border border-border">
              <EmptyState
                icon={CalendarDays}
                title="No rota for this week"
                description="Generate a rota using the AI agent or the Generate Rota button."
                action={{ label: "Generate rota", onClick: () => {} }}
              />
            </div>
          </Row>
          <Row label="Leaves — none pending">
            <div className="w-full rounded-lg border border-border">
              <EmptyState
                icon={CheckCircle2}
                title="No pending leave requests"
                description="All leave requests have been reviewed."
              />
            </div>
          </Row>
        </Section>

        {/* ---- Loading skeletons ---- */}
        <Section title="Loading Skeletons">
          <Row label="Table skeleton (5 rows)">
            <div className="w-full">
              <TableSkeleton rows={5} />
            </div>
          </Row>
          <Row label="Card skeletons">
            <div className="grid grid-cols-3 gap-4 w-full">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </Row>
          <Row label="Inline skeletons">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </Row>
        </Section>

        {/* ---- Spacing grid ---- */}
        <Section title="Spacing Grid (8px base)">
          <Row label="Multiples of 8px">
            {[8, 16, 24, 32, 40, 48, 64].map((size) => (
              <div key={size} className="flex flex-col items-center gap-1">
                <div
                  className="bg-primary/20 rounded"
                  style={{ width: size, height: size }}
                />
                <p className="text-[14px] text-muted-foreground">{size}px</p>
              </div>
            ))}
          </Row>
        </Section>

        {/* ---- Icons ---- */}
        <Section title="Icons (Lucide, 16px / 20px)">
          <Row label="16px — inline / badge">
            <div className="flex gap-4 text-muted-foreground">
              <FlaskConical className="size-4" />
              <Users className="size-4" />
              <CalendarDays className="size-4" />
              <AlertTriangle className="size-4 text-destructive" />
              <CheckCircle2 className="size-4 text-emerald-600" />
            </div>
          </Row>
          <Row label="20px — section / empty state">
            <div className="flex gap-4 text-muted-foreground">
              <FlaskConical className="size-5" />
              <Users className="size-5" />
              <CalendarDays className="size-5" />
            </div>
          </Row>
        </Section>

      </div>
    </div>
  )
}
