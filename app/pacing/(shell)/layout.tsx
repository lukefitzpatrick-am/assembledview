import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import { getPacingClientScopeIds } from "@/lib/pacing/pacingScopeServer"
import { PacingFilterProvider } from "@/lib/pacing/usePacingFilterStore"
import { PacingShell } from "@/components/pacing/PacingShell"

export default async function PacingShellLayout({ children }: { children: ReactNode }) {
  const session = await auth0.getSession()
  const user = session?.user
  if (!user) {
    redirect("/auth/login?returnTo=/pacing/overview")
  }
  const scope = await getPacingClientScopeIds(user)
  const assignedStr = scope === null ? [] : scope.map(String)

  return (
    <PacingFilterProvider initialAssignedClientIds={assignedStr}>
      <PacingShell>{children}</PacingShell>
    </PacingFilterProvider>
  )
}
