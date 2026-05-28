import type { BillingLineItem } from "@/lib/types/financeBilling"

/**
 * Domain 5 Stage 3.1 — collapse repeated line items into grouped summary rows.
 *
 * Rows are considered identical when their normalized (publisher_name, description)
 * match: case-insensitive, whitespace-trimmed, collapsed internal whitespace.
 * Amounts are NOT part of the identity — two $175 rows and one $200 row with the
 * same publisher+description collapse into one group of 3 with the summed total.
 *
 * line_type is part of the identity (never merge a media line with a fee line).
 */

export type GroupedLineItem = {
  key: string
  publisher_name: string | null
  description: string | null
  line_type: BillingLineItem["line_type"]
  media_type: string | null
  count: number
  total: number
  items: BillingLineItem[]
}

function normalize(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

export function groupIdenticalLineItems(lineItems: BillingLineItem[]): GroupedLineItem[] {
  const groups = new Map<string, GroupedLineItem>()
  const order: string[] = []

  for (const li of lineItems) {
    const key = [li.line_type, normalize(li.publisher_name), normalize(li.description)].join("\u001f")

    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        publisher_name: li.publisher_name,
        description: li.description,
        line_type: li.line_type,
        media_type: li.media_type,
        count: 0,
        total: 0,
        items: [],
      }
      groups.set(key, group)
      order.push(key)
    }
    group.count += 1
    group.total += li.amount
    group.items.push(li)
  }

  for (const g of groups.values()) {
    g.total = Math.round(g.total * 100) / 100
  }

  return order.map((k) => groups.get(k)!)
}
