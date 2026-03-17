"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export function AdminSignOut() {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-muted-foreground">
      <LogOut className="size-3.5" />
      Sign out
    </Button>
  )
}
