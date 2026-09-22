import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { RelabelsClient, type RelabelsQuery } from "@/components/pacing/relabel/RelabelsClient"

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function PacingAdminRelabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing/admin/relabels")
  }
  const roles = getUserRoles(session.user)
  if (roles.includes("client")) {
    redirect("/unauthorized")
  }

  const sp = await searchParams
  const initial: RelabelsQuery = {
    tab: first(sp.tab),
    mba: first(sp.mba),
    line: first(sp.line),
    channel: first(sp.channel),
    entity: first(sp.entity),
    id: first(sp.id),
  }

  return <RelabelsClient initial={initial} />
}
