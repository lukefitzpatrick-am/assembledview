import { getClientHubSummariesForAdminHub } from '@/lib/api/dashboard'
import { loadWebReportStatusesBySlug } from '@/lib/webReport/admin/statusLoad'
import { ClientHubPageClient } from './ClientHubPageClient'

export const dynamic = 'force-dynamic'

export default async function ClientHubPage() {
  const [summaries, webStatuses] = await Promise.all([
    getClientHubSummariesForAdminHub(),
    loadWebReportStatusesBySlug(),
  ])
  return <ClientHubPageClient summaries={summaries} webStatuses={webStatuses.ok ? webStatuses.bySlug : null} />
}
