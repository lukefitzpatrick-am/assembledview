import { AdminGuard } from '@/components/guards/AdminGuard'

export default function ClientHubLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>
}
