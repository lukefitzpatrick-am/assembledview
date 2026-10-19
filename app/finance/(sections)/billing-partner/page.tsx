import { Suspense } from "react"

import { BillingPartnerPageClient } from "@/components/finance/billingPartner/BillingPartnerPageClient"
import { LoadingState } from "@/components/finance/sections/LoadingState"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/finance/billing-partner")

export default function BillingPartnerPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="m-4" />}>
      <BillingPartnerPageClient />
    </Suspense>
  )
}
