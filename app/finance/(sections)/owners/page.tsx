import { Suspense } from "react"

import { LoadingState } from "@/components/finance/sections/LoadingState"
import { FinanceOwnersPageClient } from "@/components/finance/sections/owners/FinanceOwnersPageClient"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/finance/owners")

export default function FinanceOwnersPage() {
  return (
    <Suspense fallback={<LoadingState rows={8} className="m-4" />}>
      <FinanceOwnersPageClient />
    </Suspense>
  )
}
