import { Suspense } from "react"
import { OwedPageClient } from "@/components/finance/sections/owed/OwedPageClient"
import { LoadingState } from "@/components/finance/sections/LoadingState"

export default function FinanceOwedPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="m-4" />}>
      <OwedPageClient />
    </Suspense>
  )
}
