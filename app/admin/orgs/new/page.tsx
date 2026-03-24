"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createOrganisation } from "@/app/admin/actions"
import { generateSlug } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { AdminImportWizard } from "@/components/admin-import-wizard"

export default function NewOrgPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName]     = useState("")
  const [slug, setSlug]     = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError]   = useState("")
  const [createMode, setCreateMode] = useState<"scratch" | "import">("scratch")

  function handleNameChange(value: string) {
    setName(value)
    if (!slugEdited) setSlug(generateSlug(value))
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true)
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createOrganisation(fd)
      if (result?.error) setError(result.error)
      else if ((result as { orgId?: string })?.orgId) {
        router.push(`/admin/orgs/${(result as { orgId: string }).orgId}`)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 max-w-md">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[18px] font-medium">New organisation</h1>
      </div>

      {/* Org name — always visible */}
      <div className="rounded-lg border border-border bg-background p-4">
        <label className="text-[13px] font-medium text-muted-foreground">Nombre de la organización</label>
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Clínica FIV Madrid"
          className="mt-1"
        />
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-input overflow-hidden w-fit">
        <button
          type="button"
          onClick={() => setCreateMode("scratch")}
          className={`px-4 py-2 text-[13px] font-medium transition-colors ${createMode === "scratch" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
        >
          Empezar desde cero
        </button>
        <button
          type="button"
          onClick={() => setCreateMode("import")}
          className={`px-4 py-2 text-[13px] font-medium transition-colors ${createMode === "import" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
        >
          Importar desde Excel
        </button>
      </div>

      {createMode === "import" ? (
        <div className="rounded-lg border border-border bg-background p-6">
          <AdminImportWizard orgName={name} />
        </div>
      ) : (
      <div className="rounded-lg border border-border bg-background p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[14px] text-red-600">{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-[14px] font-medium">
              Organisation name
            </label>
            <Input
              id="name"
              name="name"
              placeholder="Clínica FIV Madrid"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="slug" className="text-[14px] font-medium">
              Slug <span className="text-muted-foreground font-normal">(URL identifier, must be unique)</span>
            </label>
            <Input
              id="slug"
              name="slug"
              placeholder="clinica-fiv-madrid"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
              disabled={isPending}
            />
            {slug && (
              <p className="text-[13px] text-muted-foreground">
                labrota.app/{slug}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isPending || !name || !slug}>
              {isPending ? "Creating…" : "Create organisation"}
            </Button>
            <Button variant="outline" render={<Link href="/" />}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
      )}
    </div>
  )
}
