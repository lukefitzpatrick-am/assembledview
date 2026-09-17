import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import { getPacingClientScopeIds } from "@/lib/pacing/pacingScopeServer"
import { PacingFilterProvider } from "@/lib/pacing/usePacingFilterStore"
import { getUserRoles } from "@/lib/rbac"
import { CampaignDetailProvider } from "@/components/pacing/detail/CampaignDetailContext"
import { ScenarioPlannerProvider } from "@/components/pacing/scenario/ScenarioPlannerContext"
import { PacingShell } from "@/components/pacing/PacingShell"

export default async function PacingShellLayout({ children }: { children: ReactNode }) {
  const session = await auth0.getSession()
  const user = session?.user
  if (!user) {
    redirect("/auth/login?returnTo=/pacing/portfolio")
  }
  const scope = await getPacingClientScopeIds(user)
  const assignedStr = scope === null ? [] : scope.map(String)
  const roles = getUserRoles(user)
  const isAdmin = roles.includes("admin")

  return (
    <PacingFilterProvider initialAssignedClientIds={assignedStr}>
      <ScenarioPlannerProvider>
        <CampaignDetailProvider>
          <PacingShell isAdmin={isAdmin}>{children}</PacingShell>
        </CampaignDetailProvider>
      </ScenarioPlannerProvider>
    </PacingFilterProvider>
  )
}
