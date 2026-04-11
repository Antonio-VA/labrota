import { createClient } from "@/lib/supabase/server"
import { MobileAccountView } from "@/components/mobile-account-view"
import { getUserPreferences, getUserOutlookStatus } from "@/app/(clinic)/account-actions"

export default async function MobileAccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [prefs, outlook] = await Promise.all([
    getUserPreferences(),
    getUserOutlookStatus(),
  ])

  return (
    <div className="flex-1 overflow-auto lg:hidden bg-background text-foreground">
      <MobileAccountView
        initialUser={user ? {
          email: user.email ?? null,
          fullName: (user.user_metadata?.full_name as string) ?? null,
          avatarUrl: (user.user_metadata?.avatar_url as string) ?? null,
        } : null}
        initialPrefs={prefs}
        initialOutlook={outlook}
      />
    </div>
  )
}
