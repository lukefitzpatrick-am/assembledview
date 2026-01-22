import DashboardOverview from "@/components/dashboard/DashboardOverview"
import { redirect } from "next/navigation"
import { auth0 } from "@/lib/auth0"
import { getUserClientIdentifier, getUserRoles, getUserPrimaryMbaNumber, getUserMbaNumbers } from "@/lib/rbac"

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
  console.log("[dashboard] User access check", {
    email: user.email,
    roles,
    clientSlug,
    isClient,
    isAdmin,
  })

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
      console.log("[dashboard] Redirecting client to primary MBA", {
        clientSlug,
        primaryMba,
      })
      redirect(`/dashboard/${clientSlug}/${primaryMba}`)
    }
    
    // If only one MBA is assigned, redirect to that campaign
    if (mbaNumbers.length === 1) {
      console.log("[dashboard] Redirecting client to single MBA", {
        clientSlug,
        mbaNumber: mbaNumbers[0],
      })
      redirect(`/dashboard/${clientSlug}/${mbaNumbers[0]}`)
    }

    // Otherwise redirect to client dashboard
    console.log("[dashboard] Redirecting client to client dashboard", {
      clientSlug,
      mbaCount: mbaNumbers.length,
    })
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
  console.log("[dashboard] Admin access granted to global dashboard")
  return <DashboardOverview returnTo="/dashboard" />
}