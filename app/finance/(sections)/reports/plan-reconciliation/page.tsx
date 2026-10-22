import { Suspense } from "react"

import { LoadingState } from "@/components/finance/sections/LoadingState"
import { PlanReconciliationPageClient } from "@/components/finance/sections/reports/PlanReconciliationPageClient"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/finance/reports/plan-reconciliation")

export default function PlanReconciliationPage() {
  return (
    <Suspense fallback={<LoadingState rows={8} className="m-4" />}>
      <PlanReconciliationPageClient />
    </Suspense>
  )
}
