import { redirect } from "next/navigation"

import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { BehaviouralPlannerClient } from "./planner-client"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/tools/behavioural-planner")

export default async function BehaviouralPlannerPage() {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/tools/behavioural-planner")
  }

  const roles = getUserRoles(session.user)
  if (roles.includes("client")) {
    redirect("/unauthorized")
  }

  return <BehaviouralPlannerClient />
}
