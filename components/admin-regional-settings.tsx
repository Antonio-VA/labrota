"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { COUNTRIES, getCountry } from "@/lib/regional-config"
import { CheckCircle2 } from "lucide-react"

export function AdminRegionalSettings({
  orgId,
  initialCountry,
  initialRegion,
  onSave,
}: {
  orgId: string
  initialCountry: string
  initialRegion: string
  onSave: (orgId: string, country: string, region: string) => Promise<{ error?: string }>
}) {
  const [country, setCountry] = useState(initialCountry)
  const [region, setRegion] = useState(initialRegion)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const countryConfig = getCountry(country)

  function handleCountryChange(code: string) {
    setCountry(code)
    setRegion("")
  }

  function handleSave() {
    startTransition(async () => {
      const result = await onSave(orgId, country, region)
      if (result.error) toast.error(result.error)
      else { setSaved(true); setTimeout(() => setSaved(false), 3000) }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <label className="text-[14px] font-medium shrink-0">Country</label>
        <select
          value={country}
          onChange={(e) => handleCountryChange(e.target.value)}
          disabled={isPending}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring min-w-[220px]"
        >
          <option value="">— Select —</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name_en}</option>
          ))}
        </select>
      </div>

      {countryConfig && countryConfig.regions.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <label className="text-[14px] font-medium shrink-0">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={isPending}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring min-w-[220px]"
          >
            <option value="">— Select —</option>
            {countryConfig.regions.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-[13px] text-emerald-600">
            <CheckCircle2 className="size-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  )
}
