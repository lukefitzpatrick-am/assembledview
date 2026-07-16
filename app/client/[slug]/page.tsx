import { notFound, redirect } from 'next/navigation'
import { getClientDashboardData } from '@/lib/api/dashboard'
import { auth0 } from '@/lib/auth0'
import { fetchClientById } from '@/lib/clients/fetchClientById'
import { fetchXanoClientRowByUrlSlug } from '@/lib/clients/fetchClientRowByUrlSlug'
import { hasRole } from '@/lib/rbac'
import { ClientDashboardPageContent } from '@/components/dashboard/ClientDashboardPageContent'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function ClientHubDetailPage({ params }: PageProps) {
  const { slug } = await params
  if (!slug?.trim()) {
    notFound()
  }

  const session = await auth0.getSession()
  const user = session?.user
  if (!user) {
    redirect(`/auth/login?returnTo=/client/${encodeURIComponent(slug)}`)
  }
  // Match AdminGuard: full client row (incl. brain) only for admins — never for tenant clients.
  if (!hasRole(user, ['admin'])) {
    redirect('/dashboard')
  }

  const [clientData, slugRow] = await Promise.all([
    getClientDashboardData(slug),
    fetchXanoClientRowByUrlSlug(slug),
  ])

  const clientRecord =
    slugRow?.id != null
      ? (await fetchClientById(slugRow.id as string | number)) ?? slugRow
      : slugRow

  if (!clientData) {
    notFound()
  }

  const clientLogo =
    typeof clientRecord?.logo === 'string' && clientRecord.logo.trim()
      ? clientRecord.logo
      : typeof clientRecord?.client_logo === 'string' && clientRecord.client_logo.trim()
        ? clientRecord.client_logo
        : undefined

  return (
    <ClientDashboardPageContent
      slug={slug}
      clientData={{ ...clientData, clientRecord, clientLogo }}
      campaignLinkMode="adminHub"
      headerDescription="Client hub — campaign dashboard"
    />
  )
}
