"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeftRight, Palmtree, Loader2, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import type { SwapCandidate } from "@/app/(clinic)/swaps/actions"
import type { SwapType } from "@/lib/types/database"

interface SwapRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignmentId: string
  shiftType: string
  date: string
  dateLabel: string
  locale: "es" | "en"
}

type Step = "type" | "candidates" | "confirm"

export function SwapRequestDialog({
  open, onOpenChange, assignmentId, shiftType, date, dateLabel, locale,
}: SwapRequestDialogProps) {
  const t = useTranslations("swaps")
  const [step, setStep] = useState<Step>("type")
  const [swapType, setSwapType] = useState<SwapType>("shift_swap")
  const [candidates, setCandidates] = useState<SwapCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<SwapCandidate | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function reset() {
    setStep("type")
    setSwapType("shift_swap")
    setCandidates([])
    setSelectedCandidate(null)
    setError(null)
    setSuccess(false)
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  async function handleSelectType(type: SwapType) {
    setSwapType(type)
    setLoading(true)
    setError(null)
    try {
      const { getSwapCandidates } = await import("@/app/(clinic)/swaps/actions")
      const result = await getSwapCandidates(assignmentId)
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      // Filter candidates based on swap type
      const filtered = type === "shift_swap"
        ? result.candidates.filter(c => c.shiftType !== null)  // must be working
        : result.candidates  // anyone available

      setCandidates(filtered)
      setStep("candidates")
    } catch {
      setError("Failed to load candidates.")
    }
    setLoading(false)
  }

  function handleSelectCandidate(candidate: SwapCandidate) {
    setSelectedCandidate(candidate)
    setStep("confirm")
  }

  function handleSubmit() {
    if (!selectedCandidate) return
    setError(null)

    startTransition(async () => {
      try {
        const { createSwapRequest } = await import("@/app/(clinic)/swaps/actions")
        const result = await createSwapRequest({
          assignmentId,
          swapType,
          targetStaffId: selectedCandidate.staffId,
          targetAssignmentId: selectedCandidate.assignmentId ?? undefined,
        })

        if (result.error) {
          setError(result.error)
          return
        }

        setSuccess(true)
        setTimeout(() => handleOpenChange(false), 2000)
      } catch {
        setError("Failed to submit swap request.")
      }
    })
  }

  const isEs = locale === "es"

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-primary" />
            {t("requestSwap")}
          </SheetTitle>
          <SheetDescription>
            {shiftType} · {dateLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {/* Success state */}
          {success && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="size-12 rounded-full bg-green-100 flex items-center justify-center">
                <ArrowLeftRight className="size-5 text-green-600" />
              </div>
              <p className="text-[14px] font-medium text-green-700">
                {isEs ? "Solicitud enviada" : "Request submitted"}
              </p>
              <p className="text-[12px] text-muted-foreground text-center">
                {isEs ? "Tu responsable recibirá un email para aprobar." : "Your manager will receive an email to approve."}
              </p>
            </div>
          )}

          {/* Error */}
          {error && !success && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-3">
              <p className="text-[13px] text-red-700">{error}</p>
            </div>
          )}

          {/* Step 1: Type selection */}
          {step === "type" && !success && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-[13px] text-muted-foreground font-medium">{t("selectType")}</p>
              <button
                onClick={() => handleSelectType("shift_swap")}
                disabled={loading}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
              >
                <ArrowLeftRight className="size-5 text-primary shrink-0" />
                <div>
                  <p className="text-[14px] font-medium">{t("swapShift")}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {isEs ? "Intercambia tu turno con el de un compañero" : "Exchange your shift with a colleague's"}
                  </p>
                </div>
              </button>
              <button
                onClick={() => handleSelectType("day_off")}
                disabled={loading}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
              >
                <Palmtree className="size-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium">{t("dayOff")}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {isEs ? "Pide el día libre; un compañero cubre tu turno" : "Take the day off; a colleague covers your shift"}
                  </p>
                </div>
              </button>
              {loading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-5 text-primary animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* Step 2: Candidate list */}
          {step === "candidates" && !success && (
            <div className="flex flex-col gap-2 py-2">
              <p className="text-[13px] text-muted-foreground font-medium">
                {swapType === "shift_swap" ? t("selectCandidate") : t("selectCover")}
              </p>
              {candidates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <User className="size-8 text-muted-foreground/40" />
                  <p className="text-[13px] text-muted-foreground">{t("noCandidates")}</p>
                </div>
              ) : (
                candidates.map(c => (
                  <button
                    key={c.staffId}
                    onClick={() => handleSelectCandidate(c)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                  >
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[12px] font-semibold text-primary">
                        {c.firstName[0]}{c.lastName[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium">{c.firstName} {c.lastName}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {c.shiftType
                          ? `${isEs ? "Turno" : "Shift"}: ${c.shiftType}`
                          : (isEs ? "Libre" : "Off")}
                      </p>
                    </div>
                    {c.coverageWarning && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">
                        ⚠
                      </span>
                    )}
                  </button>
                ))
              )}
              <button
                onClick={() => { setStep("type"); setCandidates([]); setSelectedCandidate(null) }}
                className="text-[13px] text-primary font-medium mt-2"
              >
                ← {isEs ? "Volver" : "Back"}
              </button>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === "confirm" && selectedCandidate && !success && (
            <div className="flex flex-col gap-4 py-2">
              <p className="text-[13px] text-muted-foreground font-medium">{t("confirm")}</p>

              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] text-muted-foreground">{isEs ? "Tipo" : "Type"}</span>
                  <span className="text-[14px] font-medium">
                    {swapType === "shift_swap" ? t("swapShift") : t("dayOff")}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] text-muted-foreground">{isEs ? "Fecha" : "Date"}</span>
                  <span className="text-[14px] font-medium">{dateLabel}</span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] text-muted-foreground">{isEs ? "Tu turno" : "Your shift"}</span>
                  <span className="text-[14px] font-medium">{shiftType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground">{isEs ? "Con" : "With"}</span>
                  <span className="text-[14px] font-medium">{selectedCandidate.firstName} {selectedCandidate.lastName}</span>
                </div>
              </div>

              <p className="text-[12px] text-muted-foreground">
                {isEs
                  ? "Tu responsable recibirá un email para aprobar la solicitud. Si aprueba, tu compañero podrá aceptar o rechazar."
                  : "Your manager will receive an email to approve the request. If approved, your colleague can then accept or decline."}
              </p>
            </div>
          )}
        </div>

        {step === "confirm" && selectedCandidate && !success && (
          <SheetFooter>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setStep("candidates"); setSelectedCandidate(null) }}
              >
                {t("cancel")}
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                {t("submit")}
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
