import { australianFyStartYearForDate } from "@/lib/finance/months"

/** Deep-link into invoicing scope for a client + billing month. */
export function invoicingHrefForClientMonth(clientId: number, periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map((x) => Number.parseInt(x, 10))
  const ref = new Date(y!, (m ?? 1) - 1, 1)
  const fy = australianFyStartYearForDate(ref)
  const p = new URLSearchParams()
  p.set("fy", String(fy))
  p.set("from", periodMonth)
  p.set("to", periodMonth)
  p.set("clients", String(clientId))
  return `/finance/invoicing?${p.toString()}`
}

export function mbaHref(mbaNumber: string): string {
  return `/mediaplans/mba/${encodeURIComponent(mbaNumber.trim())}`
}
