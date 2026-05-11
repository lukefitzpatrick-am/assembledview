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
      <PacingSettingsClient />
    </div>
  )
}
