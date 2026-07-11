import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** Legacy path — receivables now live on the finance hub billing tab. */
export default function ReceivablesPage() {
  redirect("/finance?tab=billing")
}
