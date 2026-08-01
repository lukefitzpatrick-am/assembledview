import { Suspense } from "react"
import ForecastingPageClient from "@/components/finance/sections/forecasting/ForecastingPageClient"
import { LoadingState } from "@/components/finance/sections/LoadingState"

export default function FinanceForecastingPage() {
  return (
    <Suspense fallback={<LoadingState rows={8} className="m-4" />}>
      <ForecastingPageClient />
    </Suspense>
  )
}
