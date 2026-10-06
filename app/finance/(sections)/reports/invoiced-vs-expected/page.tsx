import { Suspense } from "react"

import { InvoicedVsExpectedPageClient } from "@/components/finance/sections/reports/InvoicedVsExpectedPageClient"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/finance/reports/invoiced-vs-expected")

export default function InvoicedVsExpectedPage() {
  return (
    <Suspense fallback={<LoadingState rows={8} className="m-4" />}>
      <InvoicedVsExpectedPageClient />
    </Suspense>
  )
}
