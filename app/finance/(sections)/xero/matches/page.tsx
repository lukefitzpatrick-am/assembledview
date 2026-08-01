import { Suspense } from "react"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { XeroPageClient } from "@/components/finance/sections/xero/XeroPageClient"

export default function FinanceXeroMatchesPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="m-4" />}>
      <XeroPageClient section="matches" />
    </Suspense>
  )
}
