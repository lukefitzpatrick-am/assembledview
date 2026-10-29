import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { ViewAsEndedActions } from "@/components/view-as/ViewAsEndedActions"
import { auth0Raw } from "@/lib/auth0"
import { normaliseViewAsSlug, VIEW_AS_HINT_COOKIE } from "@/lib/auth/viewAs"
import { pageMetadata } from "@/lib/nav/routeManifest"
import { userHasAdminAccess } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const metadata = pageMetadata("/view-as/ended")

/**
 * Where middleware sends an admin whose client view lapsed (expired, switched
 * off or not valid), so the screen never flips to the admin view mid-demo.
 * The actions call the exit route on load: cookies cleared, `expire` audited.
 */
export default async function ViewAsEndedPage() {
  const raw = await auth0Raw.getSession()
  if (!raw?.user) redirect("/auth/login")
  if (!userHasAdminAccess(raw.user)) redirect("/")
  const store = await cookies()
  const slug = normaliseViewAsSlug(store.get(VIEW_AS_HINT_COOKIE)?.value) || null

  return (
    <PageShell width="narrow">
      <PageHeader title="Client view ended" lede="Start again or return to the client hub." />
      <ViewAsEndedActions slug={slug} />
    </PageShell>
  )
}
