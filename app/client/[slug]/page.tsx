import { notFound } from 'next/navigation'
import { getClientDashboardData } from '@/lib/api/dashboard'
import { fetchXanoClientRowByUrlSlug } from '@/lib/clients/fetchClientRowByUrlSlug'
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

  const [clientData, clientRecord] = await Promise.all([
    getClientDashboardData(slug),
    fetchXanoClientRowByUrlSlug(slug),
  ])

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
