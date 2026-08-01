import { Suspense } from "react"
import { InvoicingPageClient } from "@/components/finance/sections/invoicing/InvoicingPageClient"
import { LoadingState } from "@/components/finance/sections/LoadingState"

export default function FinanceInvoicingPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} className="m-4" />}>
      <InvoicingPageClient />
    </Suspense>
  )
}
