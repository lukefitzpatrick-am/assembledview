import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { auth0 } from "@/lib/auth0"
import { DASHBOARD_SURFACE } from "@/lib/client-dashboard/palette"
import { getUserRoles } from "@/lib/rbac"

/**
 * Admin-only shell for client-dashboard mock previews (not production).
 * Mirrors the `/pacing/settings` gate: session required + `admin` role.
 */
export default async function ClientDashboardMockLayout({ children }: { children: ReactNode }) {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/client-dashboard/mock")
  }
  const roles = getUserRoles(session.user)
  if (!roles.includes("admin")) {
    redirect("/unauthorized")
  }

  return (
    <div className="min-h-svh" style={{ backgroundColor: DASHBOARD_SURFACE }}>
      {children}
    </div>
  )
}
