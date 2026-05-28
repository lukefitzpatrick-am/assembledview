import { Suspense } from "react"
import { ReceivablesPageClient } from "./ReceivablesPageClient"

export const dynamic = "force-dynamic"

export default function ReceivablesPage() {
  return (
    <Suspense fallback={null}>
      <ReceivablesPageClient />
    </Suspense>
  )
}
