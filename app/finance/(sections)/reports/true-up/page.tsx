import { Suspense } from "react"
import { notFound } from "next/navigation"

import { LoadingState } from "@/components/finance/sections/LoadingState"
import { TrueUpPageClient } from "@/components/finance/sections/reports/TrueUpPageClient"
import { isTrueUpEnabled } from "@/lib/finance/trueUp/flag"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/finance/reports/true-up")
export const dynamic = "force-dynamic"

export default function TrueUpPage() {
  if (!isTrueUpEnabled()) notFound()
  return (
    <Suspense fallback={<LoadingState rows={8} className="m-4" />}>
      <TrueUpPageClient />
    </Suspense>
  )
}
