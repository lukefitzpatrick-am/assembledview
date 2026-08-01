"use client"

import { Suspense } from "react"
import { FinanceSectionsOverview } from "@/components/finance/sections/FinanceSectionsOverview"
import { LoadingState } from "@/components/finance/sections/LoadingState"

/** Flag-ON /finance landing — real overview (sections summary endpoint). */
export function FinanceSectionsLanding() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="m-4" />}>
      <FinanceSectionsOverview />
    </Suspense>
  )
}
