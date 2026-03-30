import { Suspense } from "react"
import { PublishersPageClient } from "./PublishersPageClient"

export default function PublishersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-3 px-6 py-12">
          <div className="relative h-5 w-5">
            <div className="absolute inset-0 rounded-full border-2 border-muted" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
          </div>
          <span className="text-sm text-muted-foreground">Loading publishers…</span>
        </div>
      }
    >
      <PublishersPageClient />
    </Suspense>
  )
}
