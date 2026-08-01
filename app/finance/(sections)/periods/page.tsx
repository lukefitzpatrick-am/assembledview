import { Suspense } from "react"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { PeriodsPageClient } from "@/components/finance/sections/periods/PeriodsPageClient"

export default function FinancePeriodsPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="m-4" />}>
      <PeriodsPageClient />
    </Suspense>
  )
}
