import { Suspense } from "react"
import FinanceHubPageClient from "./FinanceHubPageClient"

function FinanceHubFallback() {
  return (
    <div className="w-full max-w-none px-4 pb-10 pt-0 md:px-6">
      <div className="animate-pulse space-y-4 py-6">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="h-4 w-full max-w-md rounded-md bg-muted" />
        <div className="h-32 rounded-md bg-muted" />
      </div>
    </div>
  )
}

export default function FinancePage() {
  return (
    <Suspense fallback={<FinanceHubFallback />}>
      <FinanceHubPageClient />
    </Suspense>
  )
}
