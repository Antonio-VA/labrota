import { createClient } from "@/lib/supabase/server"
import { MobileAccountView } from "@/components/mobile-account-view"

export default async function MobileAccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex-1 overflow-auto md:hidden">
      <MobileAccountView
        initialUser={user ? {
          email: user.email ?? null,
          fullName: (user.user_metadata?.full_name as string) ?? null,
          avatarUrl: (user.user_metadata?.avatar_url as string) ?? null,
        } : null}
      />
    </div>
  )
}
