import { Suspense } from "react"
import { PortfolioClient } from "./PortfolioClient"

export default function PacingPortfolioPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <PortfolioClient />
    </Suspense>
  )
}
