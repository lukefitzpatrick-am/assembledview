import { redirect } from 'next/navigation'
import { auth0 } from '@/lib/auth0'
import { getPrimaryRole, getUserClientIdentifier } from '@/lib/rbac'
import { notFound } from 'next/navigation'
import { getClientDashboardData } from '@/lib/api/dashboard'
import { fetchXanoClientRowByUrlSlug } from '@/lib/clients/fetchClientRowByUrlSlug'
import { ClientDashboardPageContent } from '@/components/dashboard/ClientDashboardPageContent'

interface ClientDashboardProps {
  params: Promise<{
    slug: string
  }>
}

export default async function ClientDashboard({ params }: ClientDashboardProps) {
  const { slug } = await params
  const session = await auth0.getSession()
  const user = session?.user
  const role = getPrimaryRole(user)
  const userClientSlug = getUserClientIdentifier(user)

  if (!user) {
    redirect(`/auth/login?returnTo=/dashboard/${slug}`)
  }

  console.log('[dashboard/[slug]] Tenant safety check', {
    email: user.email,
    role,
    requestedSlug: slug,
    userClientSlug,
    app_metadata: user['app_metadata'],
  })

  if (role === 'client') {
    if (!userClientSlug) {
      console.error('[dashboard/[slug]] Client user missing client_slug in app_metadata', {
        email: user.email,
        requestedSlug: slug,
        app_metadata: user['app_metadata'],
      })
      notFound()
    }

    if (userClientSlug.toLowerCase() !== slug.toLowerCase()) {
      console.warn('[dashboard/[slug]] Tenant mismatch - client attempted to access another client dashboard', {
        email: user.email,
        userClientSlug,
        requestedSlug: slug,
      })
      notFound()
    }
  }

  let clientData: Awaited<ReturnType<typeof getClientDashboardData>> = null
  let error: string | null = null

  try {
    const [data, clientRecord] = await Promise.all([
      getClientDashboardData(slug),
      fetchXanoClientRowByUrlSlug(slug),
    ])
    if (data) {
      const clientLogo =
        typeof clientRecord?.logo === 'string' && clientRecord.logo.trim()
          ? clientRecord.logo
          : typeof clientRecord?.client_logo === 'string' && clientRecord.client_logo.trim()
            ? clientRecord.client_logo
            : undefined
      clientData = { ...data, clientRecord, ...(clientLogo !== undefined ? { clientLogo } : {}) }
    } else {
      clientData = null
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error occurred'
    console.error('Dashboard error:', err)
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="max-w-2xl text-center">
          <h2 className="mb-4 text-2xl font-bold text-red-900">Dashboard Unavailable</h2>
          <p className="mb-4 text-red-600">An error occurred while loading the dashboard data.</p>
          <p className="text-sm text-gray-600">Please contact support if this issue persists.</p>
        </div>
      </div>
    )
  }

  if (!clientData) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Client not found</h2>
          <p className="text-muted-foreground">The requested client dashboard could not be found.</p>
        </div>
      </div>
    )
  }

  return (
    <ClientDashboardPageContent
      slug={slug}
      clientData={clientData}
      campaignLinkMode="tenant"
    />
  )
}
