"use client"

import { useState, useTransition } from "react"
import { X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendSupportMessage } from "@/app/(clinic)/support-action"

export function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [isPending, startTransition] = useTransition()

  if (!open) return null

  function handleSend() {
    if (!subject.trim() || !message.trim()) return
    startTransition(async () => {
      const result = await sendSupportMessage(subject.trim(), message.trim())
      if (result.error) { toast.error(result.error); return }
      toast.success("Mensaje enviado. Te responderemos pronto.")
      setSubject("")
      setMessage("")
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-[420px] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-[15px] font-medium">Contactar soporte</p>
          <button onClick={onClose} className="size-7 flex items-center justify-center rounded hover:bg-muted">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <div>
            <label className="text-[12px] text-muted-foreground font-medium mb-1 block">Asunto</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="¿En qué podemos ayudarte?"
              disabled={isPending}
            />
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground font-medium mb-1 block">Mensaje</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe tu consulta o problema..."
              disabled={isPending}
              rows={5}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none disabled:opacity-50"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button size="sm" onClick={handleSend} disabled={isPending || !subject.trim() || !message.trim()}>
            {isPending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
