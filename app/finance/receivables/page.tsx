import { redirect } from "next/navigation"

/** FN7 — permanent product path is `/finance/invoicing`. */
export default function FinanceReceivablesRedirectPage() {
  redirect("/finance/invoicing")
}
