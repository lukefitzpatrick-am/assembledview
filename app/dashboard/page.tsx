import DashboardOverview from "@/components/dashboard/DashboardOverview"
import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import { getUserClientIdentifier, getUserRoles } from "@/lib/rbac"

export default async function DashboardPage() {
  const session = await auth0.getSession()
  const user = session?.user

  if (!user) {
    redirect("/auth/login?returnTo=/dashboard")
  }

  const roles = getUserRoles(user)
  const clientSlug = getUserClientIdentifier(user)

  if (roles.includes("client") && clientSlug) {
    redirect(`/dashboard/${clientSlug}`)
  }

  return <DashboardOverview returnTo="/dashboard" />
}