import { getClientHubSummariesForAdminHub } from '@/lib/api/dashboard'
import { ClientHubPageClient } from './ClientHubPageClient'

export const dynamic = 'force-dynamic'

export default async function ClientHubPage() {
  const summaries = await getClientHubSummariesForAdminHub()
  return <ClientHubPageClient summaries={summaries} />
}
