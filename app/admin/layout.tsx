import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import Image from "next/image"
import { LanguageToggle } from "@/components/language-toggle"
import { AdminSignOut } from "@/components/admin-sign-out"

export const metadata = { title: "LabRota Admin" }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== "super_admin") {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-muted">
      {/* Top nav */}
      <header className="h-12 bg-background border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/logo-wordmark.svg"
            alt="LabRota"
            width={88}
            height={18}
            priority
          />
          <span className="text-[14px] text-muted-foreground border-l border-border pl-3">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <AdminSignOut />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
