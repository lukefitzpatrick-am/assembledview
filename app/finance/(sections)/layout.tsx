import type { ReactNode } from "react"

/**
 * Sections route-group layout. Shell chrome lives in each page (or landing) so
 * flag-off "not enabled" pages stay minimal. Parent `app/finance/layout.tsx`
 * still applies AdminGuard.
 */
export default function FinanceSectionsRouteGroupLayout({ children }: { children: ReactNode }) {
  return children
}
