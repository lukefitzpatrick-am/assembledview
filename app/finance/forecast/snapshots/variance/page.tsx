import { AdminGuard } from "@/components/guards/AdminGuard"
import FinanceForecastVariancePageClient from "./FinanceForecastVariancePageClient"

export default function FinanceForecastSnapshotVariancePage() {
  return (
    <AdminGuard>
      <FinanceForecastVariancePageClient />
    </AdminGuard>
  )
}
