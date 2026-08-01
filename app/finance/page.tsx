import { redirect } from "next/navigation"

/**
 * `/finance` entry. FIN-1: Overview retired — always land on Clients billing.
 * Middleware + next.config also redirect; this is the rewrite-bypass fallback.
 */
export default function FinancePage() {
  redirect("/finance/invoicing")
}
