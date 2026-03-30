import { getClientHubSummariesForAdminHub } from '@/lib/api/dashboard'
import { ClientHubPageClient } from './ClientHubPageClient'

export default async function ClientHubPage() {
  const summaries = await getClientHubSummariesForAdminHub()
  return <ClientHubPageClient summaries={summaries} />
}
