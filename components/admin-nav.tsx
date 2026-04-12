"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/admin", label: "Organisations", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <div className="border-b border-border bg-background shrink-0">
      <div className="max-w-5xl mx-auto px-6 flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-3 py-3 text-[14px] border-b-2 transition-colors",
                active
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
