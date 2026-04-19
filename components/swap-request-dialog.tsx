"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeftRight, Palmtree, Loader2, User, X, ChevronLeft, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate, getMondayOf } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import type { SwapCandidate, DayOffCandidate, ExchangeOption } from "@/app/(clinic)/swaps/actions"
import type { SwapType } from "@/lib/types/database"

interface SwapRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignmentId: string
  shiftType: string
  date: string
  dateLabel: string
  locale: "es" | "en"
  weekStart?: string
}

type Step = "type" | "candidates" | "exchange" | "confirm"

export function SwapRequestDialog({
  open, onOpenChange, assignmentId, shiftType, date, dateLabel, locale, weekStart,
}: SwapRequestDialogProps) {
  const effectiveWeekStart = weekStart ?? getMondayOf(date)
  const t = useTranslations("swaps")
  const [step, setStep] = useState<Step>("type")
  const [swapType, setSwapType] = useState<SwapType>("shift_swap")
  const [shiftCandidates, setShiftCandidates] = useState<SwapCandidate[]>([])
  const [dayOffCandidates, setDayOffCandidates] = useState<DayOffCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<SwapCandidate | DayOffCandidate | null>(null)
  const [exchangeOptions, setExchangeOptions] = useState<ExchangeOption[]>([])
  const [selectedExchange, setSelectedExchange] = useState<ExchangeOption | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isEs = locale === "es"

  function reset() {
    setStep("type")
    setSwapType("shift_swap")
    setShiftCandidates([])
    setDayOffCandidates([])
    setSelectedCandidate(null)
    setExchangeOptions([])
    setSelectedExchange(null)
    setError(null)
    setSuccess(false)
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  async function handleSelectShiftSwap() {
    setSwapType("shift_swap")
    setLoading(true)
    setError(null)
    try {
      const { getSwapCandidates } = await import("@/app/(clinic)/swaps/actions")
      const result = await getSwapCandidates(assignmentId)
      if (result.error) { setError(result.error); setLoading(false); return }
      setShiftCandidates(result.candidates.filter(c => c.shiftType !== null))
      setStep("candidates")
    } catch { setError(isEs ? "Error al cargar compañeros." : "Failed to load candidates.") }
    setLoading(false)
  }

  async function handleSelectDayOff() {
    setSwapType("day_off")
    setLoading(true)
    setError(null)
    try {
      const { getDayOffCandidates } = await import("@/app/(clinic)/swaps/actions")
      const result = await getDayOffCandidates(assignmentId)
      if (result.error) { setError(result.error); setLoading(false); return }
      setDayOffCandidates(result.candidates)
      setStep("candidates")
    } catch { setError(isEs ? "Error al cargar compañeros." : "Failed to load candidates.") }
    setLoading(false)
  }

  function handleSelectShiftCandidate(c: SwapCandidate) {
    setSelectedCandidate(c)
    setStep("confirm")
  }

  async function handleSelectDayOffCandidate(c: DayOffCandidate) {
    setSelectedCandidate(c)
    setLoading(true)
    setError(null)
    try {
      const { getDayOffExchangeOptions } = await import("@/app/(clinic)/swaps/actions")
      const result = await getDayOffExchangeOptions(assignmentId, c.staffId, effectiveWeekStart)
      if (result.error) { setError(result.error); setLoading(false); return }
      setExchangeOptions(result.options)
      setStep("exchange")
    } catch { setError(isEs ? "Error al cargar opciones." : "Failed to load options.") }
    setLoading(false)
  }

  function handleSelectExchange(ex: ExchangeOption) {
    setSelectedExchange(ex)
    setStep("confirm")
  }

  function handleSubmit() {
    if (!selectedCandidate) return
    setError(null)

    startTransition(async () => {
      try {
        const { createSwapRequest } = await import("@/app/(clinic)/swaps/actions")
        const shiftCand = selectedCandidate as SwapCandidate
        const result = await createSwapRequest({
          assignmentId,
          swapType,
          targetStaffId: selectedCandidate.staffId,
          targetAssignmentId: swapType === "shift_swap"
            ? (shiftCand.assignmentId ?? undefined)
            : (selectedExchange?.assignmentId ?? undefined),
        })
        if (result.error) { setError(result.error); return }
        setSuccess(true)
        setTimeout(() => handleClose(), 2500)
      } catch { setError(isEs ? "Error al enviar la solicitud." : "Failed to submit swap request.") }
    })
  }

  const shiftCand = selectedCandidate as SwapCandidate | null

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={handleClose} />}

      <div className={cn(
        "fixed right-0 top-0 bottom-0 z-50 bg-background border-l border-border shadow-xl",
        "flex flex-col transition-transform duration-200 ease-out w-[380px]",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-medium">{t("requestSwap")}</p>
              <p className="text-[12px] text-muted-foreground">{shiftType} · {dateLabel}</p>
            </div>
          </div>
          <button onClick={handleClose} className="size-7 flex items-center justify-center rounded hover:bg-muted shrink-0">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">

          {/* Success */}
          {success && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="size-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="size-5 text-green-600" />
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
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-[13px] text-red-700">{error}</p>
            </div>
          )}

          {/* Step: type */}
          {step === "type" && !success && (
            <>
              <p className="text-[13px] text-muted-foreground">{t("selectType")}</p>
              <button
                onClick={handleSelectShiftSwap}
                disabled={loading}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left disabled:opacity-50"
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
                onClick={handleSelectDayOff}
                disabled={loading}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left disabled:opacity-50"
              >
                <Palmtree className="size-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium">{t("dayOff")}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {isEs ? "Cambia tu día libre con el de un compañero" : "Swap your day off with a colleague's"}
                  </p>
                </div>
              </button>
              {loading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-5 text-primary animate-spin" />
                </div>
              )}
            </>
          )}

          {/* Step: candidates */}
          {step === "candidates" && !success && (
            <>
              <button
                onClick={() => { setStep("type"); setShiftCandidates([]); setDayOffCandidates([]) }}
                className="flex items-center gap-1 text-[13px] text-primary font-medium"
              >
                <ChevronLeft className="size-3.5" />
                {isEs ? "Volver" : "Back"}
              </button>
              <p className="text-[13px] text-muted-foreground font-medium">
                {swapType === "shift_swap"
                  ? (isEs ? "Elige con quién intercambiar turno" : "Choose who to swap shifts with")
                  : (isEs ? "Elige quién te cubre (está libre ese día)" : "Choose who will cover you (they're off that day)")}
              </p>
              {(swapType === "shift_swap" ? shiftCandidates : dayOffCandidates).length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <User className="size-8 text-muted-foreground/40" />
                  <p className="text-[13px] text-muted-foreground">{t("noCandidates")}</p>
                </div>
              ) : swapType === "shift_swap" ? (
                shiftCandidates.map(c => (
                  <button
                    key={c.staffId}
                    onClick={() => handleSelectShiftCandidate(c)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                  >
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[12px] font-semibold text-primary">{c.firstName[0]}{c.lastName[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium">{c.firstName} {c.lastName}</p>
                      <p className="text-[12px] text-muted-foreground">{isEs ? "Turno" : "Shift"}: {c.shiftType}</p>
                    </div>
                  </button>
                ))
              ) : (
                <>
                  {loading && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="size-4 text-primary animate-spin" />
                    </div>
                  )}
                  {dayOffCandidates.map(c => (
                    <button
                      key={c.staffId}
                      onClick={() => handleSelectDayOffCandidate(c)}
                      disabled={loading}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left disabled:opacity-50"
                    >
                      <div className="size-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-semibold text-amber-600">{c.firstName[0]}{c.lastName[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium">{c.firstName} {c.lastName}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {isEs ? "Libre ese día" : "Off that day"}
                        </p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          )}

          {/* Step: exchange (day_off only) — shows initiator's OFF days where target is working */}
          {step === "exchange" && selectedCandidate && !success && (
            <>
              <button
                onClick={() => { setStep("candidates"); setSelectedCandidate(null); setExchangeOptions([]) }}
                className="flex items-center gap-1 text-[13px] text-primary font-medium"
              >
                <ChevronLeft className="size-3.5" />
                {isEs ? "Volver" : "Back"}
              </button>
              <div>
                <p className="text-[13px] font-medium">
                  {isEs
                    ? `¿Qué día libre tuyo le das a ${selectedCandidate.firstName} a cambio?`
                    : `Which of your days off do you give ${selectedCandidate.firstName} in exchange?`}
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {isEs ? "Cubrirás su turno ese día." : "You'll cover their shift on that day."}
                </p>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-5 text-primary animate-spin" />
                </div>
              ) : exchangeOptions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <User className="size-8 text-muted-foreground/40" />
                  <p className="text-[13px] text-muted-foreground text-center">
                    {isEs
                      ? "No hay días libres tuyos coincidentes con turnos de este compañero en las próximas 2 semanas."
                      : "No matching free days found in the next 2 weeks."}
                  </p>
                </div>
              ) : (
                exchangeOptions.map(ex => (
                  <button
                    key={ex.assignmentId}
                    onClick={() => handleSelectExchange(ex)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                  >
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[12px] font-semibold text-primary">{ex.shiftType}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium">{formatDate(ex.date, locale)}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {isEs ? "Cubrirías" : "You'd cover"}: {ex.shiftType}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </>
          )}

          {/* Step: confirm */}
          {step === "confirm" && selectedCandidate && !success && (
            <>
              <button
                onClick={() => {
                  if (swapType === "day_off") {
                    setStep("exchange")
                    setSelectedExchange(null)
                  } else {
                    setStep("candidates")
                    setSelectedCandidate(null)
                  }
                }}
                className="flex items-center gap-1 text-[13px] text-primary font-medium"
              >
                <ChevronLeft className="size-3.5" />
                {isEs ? "Volver" : "Back"}
              </button>
              <p className="text-[13px] text-muted-foreground font-medium">{t("confirm")}</p>
              <div className="rounded-lg border border-border divide-y divide-border">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[13px] text-muted-foreground">{isEs ? "Tipo" : "Type"}</span>
                  <span className="text-[13px] font-medium">
                    {swapType === "shift_swap" ? t("swapShift") : t("dayOff")}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[13px] text-muted-foreground">{isEs ? "Tu turno" : "Your shift"}</span>
                  <span className="text-[13px] font-medium">{shiftType} · {dateLabel}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[13px] text-muted-foreground">{isEs ? "Con" : "With"}</span>
                  <span className="text-[13px] font-medium">{selectedCandidate.firstName} {selectedCandidate.lastName}</span>
                </div>
                {swapType === "shift_swap" && shiftCand?.shiftType && (
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-[13px] text-muted-foreground">{isEs ? "Su turno" : "Their shift"}</span>
                    <span className="text-[13px] font-medium">{shiftCand.shiftType} · {dateLabel}</span>
                  </div>
                )}
                {swapType === "day_off" && selectedExchange && (
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-[13px] text-muted-foreground">{isEs ? "Día que das" : "Day you give"}</span>
                    <span className="text-[13px] font-medium">{selectedExchange.shiftType} · {formatDate(selectedExchange.date, locale)}</span>
                  </div>
                )}
              </div>
              <p className="text-[12px] text-muted-foreground">
                {isEs
                  ? "Tu responsable recibirá un email para aprobar. Si aprueba, tu compañero podrá aceptar o rechazar."
                  : "Your manager will receive an email to approve. If approved, your colleague can accept or decline."}
              </p>
            </>
          )}
        </div>

        {/* Footer — only on confirm step */}
        {step === "confirm" && selectedCandidate && !success && (
          <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (swapType === "day_off") {
                  setStep("exchange")
                  setSelectedExchange(null)
                } else {
                  setStep("candidates")
                  setSelectedCandidate(null)
                }
              }}
            >
              {t("cancel")}
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {t("submit")}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
