import { AdminGuard } from "@/components/guards/AdminGuard"

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>
}
