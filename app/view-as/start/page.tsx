import { notFound, redirect } from "next/navigation"

import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { ViewAsExitButton } from "@/components/view-as/ViewAsExitButton"
import { ViewAsStartForm } from "@/components/view-as/ViewAsStartForm"
import { auth0, auth0Raw } from "@/lib/auth0"
import { isViewAsEnabled, normaliseViewAsSlug, readViewAsMarker } from "@/lib/auth/viewAs"
import { fetchXanoClientRowByUrlSlug } from "@/lib/clients/fetchClientRowByUrlSlug"
import { getClientDisplayName } from "@/lib/clients/slug"
import { pageMetadata } from "@/lib/nav/routeManifest"
import { userHasAdminAccess } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const metadata = pageMetadata("/view-as/start")

/**
 * Bookmarkable start: `/view-as/start?slug=legal_super`. GET only renders the
 * confirm form; it never sets the cookie (the form POSTs). Real admin only.
 */
export default async function ViewAsStartPage({
  searchParams,
}: {
  searchParams?: Promise<{ slug?: string | string[] }>
}) {
  const raw = await auth0Raw.getSession()
  if (!raw?.user) redirect("/auth/login?returnTo=/view-as/start")
  if (!userHasAdminAccess(raw.user)) notFound()

  const effective = await auth0.getSession()
  const active = readViewAsMarker(effective?.user)
  const sp = searchParams ? await searchParams : undefined
  const slugParam = normaliseViewAsSlug(Array.isArray(sp?.slug) ? sp?.slug[0] : sp?.slug)

  let fixedClient: { slug: string; name: string } | null = null
  let missing = false
  if (slugParam) {
    const row = await fetchXanoClientRowByUrlSlug(slugParam)
    if (row) fixedClient = { slug: slugParam, name: getClientDisplayName(row) || slugParam }
    else missing = true
  }

  return (
    <PageShell width="narrow">
      <PageHeader title="View as client" lede="Simulate the client's view for a demo. Read-only, and it ends on its own." />
      {!isViewAsEnabled() ? (
        <p className="text-sm text-muted-foreground">
          View as client is switched off. Set VIEW_AS_ENABLED to on and VIEW_AS_SECRET (32+ characters) to use it.
        </p>
      ) : active ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            You are viewing as {active.clientName}. Exit the client view before starting another.
          </p>
          <div>
            <ViewAsExitButton />
          </div>
        </div>
      ) : missing ? (
        <p className="text-sm text-muted-foreground">No client found for &quot;{slugParam}&quot;.</p>
      ) : (
        <ViewAsStartForm fixedClient={fixedClient} />
      )}
    </PageShell>
  )
}
