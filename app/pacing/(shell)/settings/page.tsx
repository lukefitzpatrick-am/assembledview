import { redirect } from "next/navigation"
import Link from "next/link"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { Button } from "@/components/ui/button"
import PacingSettingsClient from "./PacingSettingsClient"

export default async function PacingSettingsPage() {
  const session = await auth0.getSession()
  if (!session?.user) {
    redirect("/auth/login?returnTo=/pacing/settings")
  }
  const roles = getUserRoles(session.user)
  if (!roles.includes("admin")) {
    redirect("/unauthorized")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pacing settings</h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/pacing/overview">Back to overview</Link>
        </Button>
      </div>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold">Pacing mappings</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage how platform line items map to media plan line items. Used by all pacing computations.
        </p>
        <Button asChild className="mt-3" variant="outline" size="sm">
          <Link href="/pacing/mappings">Open mappings</Link>
        </Button>
      </section>

      <PacingSettingsClient />
    </div>
  )
}
