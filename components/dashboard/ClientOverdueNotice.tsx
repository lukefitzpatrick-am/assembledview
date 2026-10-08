import { formatMoney } from "@/lib/format/money"
import { fromCents } from "@/lib/money"

import type { ClientInvoicesReady } from "@/components/dashboard/ClientInvoicesSection"

export const CLIENT_INVOICES_SECTION_ID = "client-invoices"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

/** Calendar day from a YYYY-MM-DD civil date. No timezone shift. */
export function formatSydneyCivilDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const month = MONTHS[Number(match[2]) - 1]
  const day = Number(match[3])
  if (!month || day < 1 || day > 31) return null
  return `${day} ${month} ${match[1]}`
}

export function overdueNoticeFact(data: ClientInvoicesReady): string | null {
  const count = data.summary.overdueCount
  const cents = data.summary.overdueCents
  if (count == null || cents == null || !Number.isFinite(cents) || count <= 0) return null
  const amount = formatMoney(fromCents(cents))
  if (count === 1) {
    const row = data.invoices.find((invoice) => invoice.state === "overdue")
    const due = row?.dueDate ? formatSydneyCivilDate(row.dueDate) : null
    if (!due) return null
    const number = row?.invoiceNumber?.trim()
    const label = number ? `Invoice ${number}` : "An invoice"
    return `${label} for ${amount} was due on ${due}.`
  }
  return `${count} invoices totalling ${amount} are past their due date.`
}

export function ClientOverdueNotice({
  data,
  accountsContactEmail,
}: {
  data: ClientInvoicesReady | null
  accountsContactEmail?: string | null
}) {
  if (!data) return null
  const fact = overdueNoticeFact(data)
  if (!fact) return null
  const email = accountsContactEmail?.trim()

  return (
    <div
      role="status"
      className="rounded-card border border-border bg-tone-critical-bg px-4 py-3 text-sm text-foreground"
    >
      <p>
        {fact}
        {email ? ` If you've already paid, thank you. Questions: ${email}.` : null}{" "}
        <a
          href={`#${CLIENT_INVOICES_SECTION_ID}`}
          className="font-medium text-primary underline underline-offset-2"
        >
          View invoices
        </a>
      </p>
    </div>
  )
}
