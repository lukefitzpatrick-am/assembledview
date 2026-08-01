import { Suspense } from "react"
import { InvestmentExplorerClient } from "@/components/finance/sections/investment/InvestmentExplorerClient"
import { LoadingState } from "@/components/finance/sections/LoadingState"

export default function FinanceInvestmentPage() {
  return (
    <Suspense fallback={<LoadingState rows={8} className="m-4" />}>
      <InvestmentExplorerClient />
    </Suspense>
  )
}
