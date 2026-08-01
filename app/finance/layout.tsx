import { AdminGuard } from "@/components/guards/AdminGuard"
import { FinancePeriodsFlagProvider } from "@/components/finance/sections/FinancePeriodsFlagContext"
import { isFinancePeriodsEnabled } from "@/lib/finance/periods/flag"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/finance")

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <FinancePeriodsFlagProvider enabled={isFinancePeriodsEnabled()}>
        {children}
      </FinancePeriodsFlagProvider>
    </AdminGuard>
  )
}
