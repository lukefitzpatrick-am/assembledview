import { redirect } from 'next/navigation'
import { auth0 } from '@/lib/auth0'
import { getPrimaryRole, getUserClientIdentifier } from '@/lib/rbac'
import { notFound } from 'next/navigation'
import { getClientDashboardData } from '@/lib/api/dashboard'
import { currentAuFyRange, rangeFromDashboardSearchParams } from '@/lib/dashboard/clientDateRange'
import { fetchXanoClientRowByUrlSlug } from '@/lib/clients/fetchClientRowByUrlSlug'
import { ClientDashboardPageContent } from '@/components/dashboard/ClientDashboardPageContent'
import { EmptyState, ErrorState } from '@/components/ui/states'

interface ClientDashboardProps {
  params: Promise<{
    slug: string
  }>
  searchParams?: Promise<{ fy?: string | string[]; startDate?: string | string[]; endDate?: string | string[] }>
}

/** Logo from the group anchor row (same branding source as clientName / brandColour). */
function logoFromClientRecord(clientRecord: Record<string, unknown> | null | undefined): string | undefined {
  if (!clientRecord) return undefined
  if (typeof clientRecord.logo === 'string' && clientRecord.logo.trim()) return clientRecord.logo
  if (typeof clientRecord.client_logo === 'string' && clientRecord.client_logo.trim()) {
    return clientRecord.client_logo
  }
  return undefined
}

export default async function ClientDashboard({ params, searchParams }: ClientDashboardProps) {
  const { slug } = await params
  const sp = searchParams ? await searchParams : undefined
  const range = rangeFromDashboardSearchParams(sp)
  const defaultRange = currentAuFyRange()
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
    // fetchXanoClientRowByUrlSlug resolves via resolveClientGroup → group.anchor
    // so mbaidentifier-slugs (penfold) keep the same logo as name-slugs (penfolds).
    const [data, clientRecord] = await Promise.all([
      getClientDashboardData(slug, { rangeStartISO: range.rangeStartISO, rangeEndISO: range.rangeEndISO }),
      fetchXanoClientRowByUrlSlug(slug),
    ])
    if (data) {
      // Tenant surface: logo only — never ship clientRecord into RSC props.
      const clientLogo = logoFromClientRecord(clientRecord)
      clientData = { ...data, ...(clientLogo !== undefined ? { clientLogo } : {}) }
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
        <ErrorState
          className="max-w-2xl"
          title="Dashboard unavailable"
          message="An error occurred while loading the dashboard data. Please contact support if this issue persists."
        />
      </div>
    )
  }

  if (!clientData) {
    return (
      <div className="flex h-96 items-center justify-center">
        <EmptyState
          title="Client not found"
          message="The requested client dashboard could not be found."
        />
      </div>
    )
  }

  return (
    <ClientDashboardPageContent
      slug={slug}
      clientData={clientData}
      campaignLinkMode="tenant"
      rangeStartISO={range.rangeStartISO}
      rangeEndISO={range.rangeEndISO}
      defaultRangeStartISO={defaultRange.rangeStartISO}
      defaultRangeEndISO={defaultRange.rangeEndISO}
    />
  )
}
