"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { COUNTRIES, getCountry } from "@/lib/regional-config"
import { updateOrgLogo } from "@/app/admin/actions"
import { getInitials } from "@/lib/utils"

export function ConfigurationSection({
  orgId,
  orgName, setOrgName,
  slug,
  logoUrl, setLogoUrl,
  country, setCountry,
  region, setRegion,
  annualLeaveDays, setAnnualLeaveDays,
  defaultDaysPerWeek, setDefaultDaysPerWeek,
  maxStaff, setMaxStaff,
  authMethod, setAuthMethod,
  disabled,
}: {
  orgId: string
  orgName: string
  setOrgName: (v: string) => void
  slug: string
  logoUrl: string | null
  setLogoUrl: (v: string | null) => void
  country: string
  setCountry: (v: string) => void
  region: string
  setRegion: (v: string) => void
  annualLeaveDays: number
  setAnnualLeaveDays: (v: number) => void
  defaultDaysPerWeek: number
  setDefaultDaysPerWeek: (v: number) => void
  maxStaff: number
  setMaxStaff: (v: number) => void
  authMethod: "otp" | "password"
  setAuthMethod: (v: "otp" | "password") => void
  disabled: boolean
}) {
  const router = useRouter()
  const countryConfig = getCountry(country)

  async function uploadLogo(file: File) {
    const supabase = createClient()
    const ext = file.name.split(".").pop() ?? "png"
    const path = `${orgId}/logo.${ext}`
    await supabase.storage.from("org-logos").upload(path, file, { upsert: true, contentType: file.type })
    const { data: { publicUrl } } = supabase.storage.from("org-logos").getPublicUrl(path)
    await updateOrgLogo(orgId, publicUrl)
    setLogoUrl(publicUrl + `?t=${Date.now()}`)
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="relative group shrink-0">
              <input
                id="org-logo-input"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = ""
                  void uploadLogo(file)
                }}
              />
              <button
                onClick={() => document.getElementById("org-logo-input")?.click()}
                className="flex size-14 items-center justify-center rounded-xl border border-border bg-muted text-[16px] font-semibold text-muted-foreground hover:border-primary transition-colors overflow-hidden relative"
              >
                {logoUrl ? (
                  <Image src={logoUrl} alt="" width={56} height={56} className="size-full object-cover" />
                ) : (
                  getInitials(orgName) ?? ""
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                  <Upload className="size-4 text-white" />
                </span>
              </button>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex flex-col gap-0.5">
                <label className="text-[12px] font-medium text-muted-foreground">Nombre</label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={disabled}
                  className="h-9 text-[14px] font-medium"
                />
              </div>
              <p className="text-[12px] text-muted-foreground">Slug: <span className="font-mono">{slug}</span></p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-5 py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[13px] text-muted-foreground shrink-0">País</label>
              <select
                value={country}
                onChange={(e) => { setCountry(e.target.value); setRegion("") }}
                disabled={disabled}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] outline-none focus-visible:border-ring"
              >
                <option value="">—</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name_en}</option>
                ))}
              </select>
            </div>
            {countryConfig && countryConfig.regions.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-[13px] text-muted-foreground shrink-0">Región</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={disabled}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] outline-none focus-visible:border-ring"
                >
                  <option value="">—</option>
                  {countryConfig.regions.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">HR</p>
          </div>
          <NumberRow
            label="Vacaciones anuales"
            suffix="días por persona al año"
            value={annualLeaveDays}
            onChange={setAnnualLeaveDays}
            min={0} max={60}
            disabled={disabled}
            borderBottom
          />
          <NumberRow
            label="Días por semana (por defecto)"
            suffix="días/semana para nuevos empleados"
            value={defaultDaysPerWeek}
            onChange={setDefaultDaysPerWeek}
            min={1} max={7}
            disabled={disabled}
            borderBottom
          />
          <NumberRow
            label="Límite de personal"
            suffix="miembros activos máximos"
            value={maxStaff}
            onChange={setMaxStaff}
            min={1} max={500}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">Método de acceso</p>
        </div>
        <div className="px-5 py-3 flex items-center gap-6">
          <span className="text-[13px] text-muted-foreground shrink-0">Inicio de sesión</span>
          {([
            { key: "password" as const, label: "Contraseña" },
            { key: "otp" as const,      label: "Código (OTP)" },
          ]).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio" name="authMethod"
                disabled={disabled}
                checked={authMethod === key}
                onChange={() => setAuthMethod(key)}
                className="accent-primary"
              />
              <span className="text-[13px] font-medium">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}

function NumberRow({
  label, suffix, value, onChange, min, max, disabled, borderBottom,
}: {
  label: string
  suffix: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  disabled: boolean
  borderBottom?: boolean
}) {
  return (
    <div className={"px-5 py-3 flex items-center gap-3 " + (borderBottom ? "border-b border-border/50" : "")}>
      <label className="text-[13px] text-muted-foreground shrink-0">{label}</label>
      <input
        type="number" min={min} max={max}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          if (!isNaN(v) && v >= min && v <= max) onChange(v)
        }}
        disabled={disabled}
        className="w-16 h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] text-center outline-none focus-visible:border-ring"
      />
      <span className="text-[12px] text-muted-foreground">{suffix}</span>
    </div>
  )
}
