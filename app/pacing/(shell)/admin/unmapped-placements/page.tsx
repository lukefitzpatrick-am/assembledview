import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { UnmappedPlacementsClient } from "./UnmappedPlacementsClient"

export default async function PacingAdminUnmappedPlacementsPage() {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing/admin/unmapped-placements")
  }
  const roles = getUserRoles(session.user)
  if (!roles.includes("admin")) {
    redirect("/unauthorized")
  }

  return <UnmappedPlacementsClient />
}
