"use client"

import { FileText, FileSpreadsheet, Image } from "lucide-react"
import { cn } from "@/lib/utils"

export function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet className="size-5 text-emerald-500" />
  if (ext === "pdf") return <FileText className="size-5 text-red-500" />
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return <Image className="size-5 text-blue-500" />
  return <FileText className="size-5 text-muted-foreground" />
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color = confidence >= 0.8 ? "bg-blue-100 text-blue-700 border-blue-200"
    : confidence >= 0.6 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-orange-100 text-orange-700 border-orange-200"
  return <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded border", color)}>{pct}%</span>
}

export function ReviewSection({ title, count, hideCount, children }: { title: string; count: number; hideCount?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-[14px] font-medium">{title}</h3>
        {!hideCount && <span className="text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>}
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}
