import { Suspense } from "react"
import { FinanceSectionsLanding } from "@/components/finance/sections/FinanceSectionsLanding"
import { LoadingState } from "@/components/finance/sections/LoadingState"

/**
 * `/finance` entry. Middleware rewrites bare `/finance` → `/finance/home`.
 * This page is the rewrite-bypass fallback — same landing as home.
 */
export default function FinancePage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="m-4" />}>
      <FinanceSectionsLanding />
    </Suspense>
  )
}
