import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { relabelsHref } from "@/lib/pacing/relabel/shared/relabelPageUrl"

export default async function PacingAdminUnmappedPlacementsPage() {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing/admin/relabels?tab=unmapped")
  }
  const roles = getUserRoles(session.user)
  if (roles.includes("client")) {
    redirect("/unauthorized")
  }

  redirect(relabelsHref({ tab: "unmapped" }))
}
