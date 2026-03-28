import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { UserAvatarMenu } from "@/components/user-avatar-menu"

export const metadata = { title: "LabRota Admin" }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.app_metadata?.role !== "super_admin") {
    redirect("/login")
  }

  const initialUser = {
    email: user.email ?? null,
    fullName: (user.user_metadata?.full_name as string) ?? null,
    avatarUrl: (user.user_metadata?.avatar_url as string) ?? null,
  }

  return (
    <div className="min-h-screen bg-muted" style={{ scrollbarGutter: "stable" }}>
      {/* Top nav — same style as clinic app */}
      <header className="h-[52px] flex items-center justify-between px-6" style={{ backgroundColor: "var(--header-bg, #1b4f8a)" }}>
        <div className="flex items-center gap-3">
          <span className="font-sans text-[18px] leading-none tracking-normal text-white">
            <span className="font-light">lab</span><span className="font-bold">rota</span>
          </span>
          <span className="text-[13px] text-white/50 border-l border-white/20 pl-3 font-medium">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-2 header-icons">
          <UserAvatarMenu initialUser={initialUser} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
