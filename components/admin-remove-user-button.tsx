"use client"

import { removeOrgUser } from "@/app/admin/actions"

export function RemoveUserButton({ userId, orgId, email }: { userId: string; orgId: string; email: string }) {
  return (
    <form
      action={removeOrgUser.bind(null, userId, orgId)}
      onSubmit={(e) => {
        if (!confirm(`Remove ${email} from this organisation?`)) e.preventDefault()
      }}
    >
      <button
        type="submit"
        className="text-[13px] text-destructive hover:underline underline-offset-2"
      >
        Remove
      </button>
    </form>
  )
}
