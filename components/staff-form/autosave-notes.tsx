"use client"

import { useState, useRef } from "react"
import { useTranslations } from "next-intl"
import { bulkUpdateStaffField } from "@/app/(clinic)/staff/actions"
import { TIMING } from "@/lib/constants"

export function AutosaveNotes({ staffId, initialValue }: { staffId: string; initialValue: string }) {
  const tc = useTranslations("common")
  const [value, setValue] = useState(initialValue)
  const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved">("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = (newValue: string) => {
    setValue(newValue)
    setSaveStatus("")
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaveStatus("saving")
      const result = await bulkUpdateStaffField([{ id: staffId, field: "notes", value: newValue }])
      setSaveStatus(result.error ? "" : "saved")
      if (!result.error) setTimeout(() => setSaveStatus(""), TIMING.TOAST_DISMISS_MS)
    }, 800)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">{tc("notes")}</p>
        {saveStatus === "saving" && <span className="text-[12px] text-muted-foreground">{tc("saving")}</span>}
        {saveStatus === "saved" && <span className="text-[12px] text-emerald-600">{tc("savedSuccessfully")}</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        rows={5}
        className="w-full rounded-[8px] border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
        placeholder={tc("optional")}
      />
    </div>
  )
}
