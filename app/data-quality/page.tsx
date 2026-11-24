import { notFound, redirect } from "next/navigation"

import { DataQualityClient } from "@/components/dataQuality/DataQualityClient"
import { auth0 } from "@/lib/auth0"
import { getOpsEmailRecipients } from "@/lib/email/sendHtmlEmail"
import { isFeatureOn } from "@/lib/features/server"
import { pageMetadata } from "@/lib/nav/routeManifest"
import { getUserRoles } from "@/lib/rbac"

export const metadata = pageMetadata("/data-quality")

/**
 * S17: the Data quality queue. Staff only (admin); clients never see it.
 * Switch `data_quality_queue` off: not found. The ops email list (Luke by
 * default) opens on every owner's overdue items; everyone else on their own.
 */
export default async function DataQualityPage() {
  const session = await auth0.getSession()
  if (!session?.user) redirect("/auth/login?returnTo=/data-quality")
  if (!getUserRoles(session.user).includes("admin")) redirect("/unauthorized")
  if (!(await isFeatureOn("data_quality_queue"))) notFound()

  const viewerEmail = typeof session.user.email === "string" ? session.user.email.trim().toLowerCase() : ""
  const overview = getOpsEmailRecipients().some((e) => e.trim().toLowerCase() === viewerEmail)
  return <DataQualityClient viewerEmail={viewerEmail} overviewByDefault={overview} />
}
