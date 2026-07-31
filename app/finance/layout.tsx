import { AdminGuard } from "@/components/guards/AdminGuard"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/finance")

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>
}
