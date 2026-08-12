import { Suspense } from "react"
import { redirect } from "next/navigation"

import { InsightsPageClient } from "./InsightsPageClient"
import { LoadingState } from "@/components/ui/states"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/insights")

export default async function InsightsPage() {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/insights")
  }
  const roles = getUserRoles(session.user)
  if (!roles.includes("admin")) {
    redirect("/forbidden")
  }

  return (
    <Suspense fallback={<LoadingState />}>
      <InsightsPageClient />
    </Suspense>
  )
}
