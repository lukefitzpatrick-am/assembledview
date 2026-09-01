import { Suspense } from "react"
import { InXeroPageClient } from "@/components/finance/sections/inXero/InXeroPageClient"
import { LoadingState } from "@/components/finance/sections/LoadingState"

export default function FinanceInXeroPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="m-4" />}>
      <InXeroPageClient />
    </Suspense>
  )
}
