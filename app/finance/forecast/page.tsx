import { AdminGuard } from "@/components/guards/AdminGuard"
import FinanceForecastPageClient from "./FinanceForecastPageClient"

export default function FinanceForecastPage() {
  return (
    <AdminGuard>
      <FinanceForecastPageClient />
    </AdminGuard>
  )
}
