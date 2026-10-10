import DashboardOverview from "@/components/dashboard/DashboardOverview"
import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import { getUserClientIdentifier, getUserRoles, getUserPrimaryMbaNumber, getUserMbaNumbers } from "@/lib/rbac"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/dashboard")

export default async function DashboardPage() {
  const session = await auth0.getSession()
  const user = session?.user

  if (!user) {
    redirect("/auth/login?returnTo=/dashboard")
  }

  const roles = getUserRoles(user)
  const clientSlug = getUserClientIdentifier(user)
  const isClient = roles.includes("client")
  const isAdmin = roles.includes("admin")

  // Log for debugging

  // Client users must be redirected to their client dashboard
  if (isClient) {
    if (!clientSlug) {
      console.error("[dashboard] Client user missing client_slug in app_metadata", {
        email: user.email,
        app_metadata: user['app_metadata'],
      })
      redirect("/unauthorized")
    }

    // Check if user has a primary MBA number or only one MBA assigned
    const primaryMba = getUserPrimaryMbaNumber(user)
    const mbaNumbers = getUserMbaNumbers(user)
    
    // If primary_mba_number exists, redirect to that campaign
    if (primaryMba) {
      redirect(`/dashboard/${clientSlug}/${primaryMba}`)
    }
    
    // If only one MBA is assigned, redirect to that campaign
    if (mbaNumbers.length === 1) {
      redirect(`/dashboard/${clientSlug}/${mbaNumbers[0]}`)
    }

    // Otherwise redirect to client dashboard
    redirect(`/dashboard/${clientSlug}`)
  }

  // Only admins can access the global dashboard
  if (!isAdmin) {
    console.warn("[dashboard] Non-admin, non-client user attempted to access global dashboard", {
      email: user.email,
      roles,
    })
    redirect("/unauthorized")
  }

  // Admin access granted
  return <DashboardOverview returnTo="/dashboard" />
}