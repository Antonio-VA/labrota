"use client"

import { useState, useTransition, useRef } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Upload, Pencil, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  updateOrgName,
  updateOrgLogo,
  updateOrgRegional,
  type OrgSettings,
} from "@/app/(clinic)/settings/actions"
import { COUNTRIES, getCountry } from "@/lib/regional-config"

export function OrgSettingsForm({
  settings,
  orgId,
}: {
  settings: OrgSettings
  orgId: string
}) {
  const t = useTranslations("orgSettings")
  const [isPending, startTransition] = useTransition()

  // Name
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(settings.name)
  const nameRef = useRef<HTMLInputElement>(null)

  // Logo
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl)
  const [uploading, setUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Regional
  const [country, setCountry] = useState(settings.country)
  const [region, setRegion] = useState(settings.region)

  function saveName() {
    if (!draftName.trim()) return
    startTransition(async () => {
      const result = await updateOrgName(draftName.trim())
      if (result.error) toast.error(result.error)
      else { toast.success(t("nameUpdated")); setEditingName(false) }
    })
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    if (file.size > 5 * 1024 * 1024) { toast.error(t("maxFileSize")); return }
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "png"
      const path = `${orgId}/logo.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("org-logos")
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) { toast.error(uploadError.message); return }
      const { data: { publicUrl } } = supabase.storage.from("org-logos").getPublicUrl(path)
      const result = await updateOrgLogo(publicUrl)
      if (result.error) { toast.error(result.error); return }
      setLogoUrl(publicUrl + `?t=${Date.now()}`)
      toast.success(t("logoUpdated"))
    } finally {
      setUploading(false)
    }
  }

  function saveRegional() {
    startTransition(async () => {
      const result = await updateOrgRegional(country, region)
      if (result.error) toast.error(result.error)
      else toast.success(t("regionalSaved"))
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Logo + Name */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => logoInputRef.current?.click()}
          disabled={uploading}
          className="size-14 rounded-xl border-2 border-dashed border-border hover:border-primary/40 flex items-center justify-center overflow-hidden shrink-0 transition-colors"
        >
          {logoUrl ? (
            <Image src={logoUrl} alt="Logo" width={56} height={56} className="size-full object-cover" />
          ) : (
            <Upload className="size-5 text-muted-foreground" />
          )}
        </button>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={handleLogoUpload}
          className="hidden"
        />
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <Input
                ref={nameRef}
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false) }}
                className="h-8 text-[14px]"
              />
              <button onClick={saveName} disabled={isPending} className="text-primary hover:text-primary/80">
                <Check className="size-4" />
              </button>
              <button onClick={() => { setEditingName(false); setDraftName(settings.name) }} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-medium truncate">{draftName}</p>
              <button onClick={() => { setEditingName(true); setTimeout(() => nameRef.current?.focus(), 50) }} className="text-muted-foreground hover:text-foreground">
                <Pencil className="size-3" />
              </button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {uploading ? t("uploadingLogo") : t("clickToChangeLogo")}
          </p>
        </div>
      </div>

      {/* Regional */}
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-muted-foreground">{t("regionalSettings")}</p>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={country}
            onChange={(e) => { setCountry(e.target.value); setRegion("") }}
            className="h-8 rounded border border-input bg-transparent px-2 text-[13px] outline-none"
          >
            <option value="">{t("country")}</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name_es}</option>
            ))}
          </select>
          {(() => {
            const countryConfig = getCountry(country)
            return countryConfig && countryConfig.regions.length > 0 ? (
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="h-8 rounded border border-input bg-transparent px-2 text-[13px] outline-none"
              >
                <option value="">{t("region")}</option>
                {countryConfig.regions.map((r) => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
            ) : country ? (
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={t("region")}
                className="h-8 text-[13px]"
              />
            ) : null
          })()}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("regionalHint")}
        </p>
        <Button
          size="sm"
          onClick={saveRegional}
          disabled={isPending || (country === settings.country && region === settings.region)}
          className="self-start text-[12px] h-7"
        >
          {t("saveRegion")}
        </Button>
      </div>

    </div>
  )
}
