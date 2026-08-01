import { AdminGuard } from '@/components/guards/AdminGuard'
import { pageMetadata } from '@/lib/nav/routeManifest'

export const metadata = pageMetadata('/client')

export default function ClientHubLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>
}
