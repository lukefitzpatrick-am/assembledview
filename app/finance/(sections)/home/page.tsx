import { redirect } from "next/navigation"

/**
 * Retired Overview landing (FIN-1). Permanent redirect → Clients billing.
 */
export default function FinanceSectionsHomePage() {
  redirect("/finance/invoicing")
}
