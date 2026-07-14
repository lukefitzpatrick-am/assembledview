import type {
  AutopopulateChannel,
  MappedLineItem,
  MapperResult,
} from "./types"

function boolField(fields: Record<string, string>, key: string): boolean {
  const v = (fields[key] ?? "").trim().toLowerCase()
  return v === "true" || v === "1" || v === "yes"
}

function field(fields: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = fields[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

/** Convert mapper line → RadioContainer initialLineItems / saveRadio shape. */
export function mappedRadioToFormItem(
  item: MappedLineItem,
  index: number,
): Record<string, unknown> {
  const f = item.fields
  const bursts = (item.bursts ?? []).map((b) => ({
    budget: b.budget ?? b.buyAmount ?? "",
    buyAmount: b.buyAmount ?? b.budget ?? "",
    startDate: b.startDate,
    endDate: b.endDate,
    calculatedValue: b.calculatedValue ?? 0,
    fee: 0,
  }))

  return {
    network: field(f, "network"),
    station: field(f, "station"),
    platform: field(f, "platform"),
    bid_strategy: field(f, "bid_strategy", "bidStrategy"),
    buy_type: field(f, "buy_type", "buyType"),
    placement: field(f, "placement"),
    format: field(f, "format"),
    duration: field(f, "duration"),
    size: field(f, "size"),
    creative_targeting: field(f, "creative_targeting", "creativeTargeting"),
    creative: field(f, "creative"),
    buying_demo: field(f, "buying_demo", "buyingDemo"),
    market: field(f, "market"),
    targeting_attribute: field(f, "targeting_attribute", "targetingAttribute"),
    fixed_cost_media: boolField(f, "fixed_cost_media"),
    client_pays_for_media: boolField(f, "client_pays_for_media"),
    budget_includes_fees: boolField(f, "budget_includes_fees"),
    no_adserving: boolField(f, "no_adserving"),
    line_item: index + 1,
    is_bonus: item.is_bonus === true,
    bursts,
    bursts_json: bursts,
  }
}

/** Convert mapper line → OOHContainer initialLineItems / saveOOHLineItems shape. */
export function mappedOohToFormItem(
  item: MappedLineItem,
  index: number,
): Record<string, unknown> {
  const f = item.fields
  const bursts = (item.bursts ?? []).map((b) => ({
    budget: b.budget ?? b.buyAmount ?? "",
    buyAmount: b.buyAmount ?? b.budget ?? "",
    startDate: b.startDate,
    endDate: b.endDate,
    calculatedValue: b.calculatedValue ?? 0,
    fee: 0,
  }))

  return {
    network: field(f, "network"),
    environment: field(f, "environment", "type"),
    format: field(f, "format"),
    type: field(f, "type", "environment"),
    location: field(f, "location"),
    placement: field(f, "placement"),
    size: field(f, "size"),
    buy_type: field(f, "buy_type", "buyType"),
    targeting_attribute: field(f, "targeting_attribute", "targetingAttribute"),
    buying_demo: field(f, "buying_demo", "buyingDemo"),
    market: field(f, "market"),
    unit_rate: field(f, "unit_rate", "unitRate"),
    fixed_cost_media: boolField(f, "fixed_cost_media"),
    client_pays_for_media: boolField(f, "client_pays_for_media"),
    budget_includes_fees: boolField(f, "budget_includes_fees"),
    no_adserving: boolField(f, "no_adserving"),
    line_item: index + 1,
    is_bonus: item.is_bonus === true,
    bursts,
    bursts_json: bursts,
  }
}

export function mapperResultToFormItems(
  result: MapperResult,
  channel: AutopopulateChannel,
): Record<string, unknown>[] {
  const paid = result.line_items.filter(
    (li) => li.channel === channel && !li.needs_review,
  )
  return paid.map((li, i) =>
    channel === "radio" ? mappedRadioToFormItem(li, i) : mappedOohToFormItem(li, i),
  )
}

export function summariseMapperResult(result: MapperResult): string {
  const paid = result.line_items.filter((li) => !li.is_bonus)
  const bonus = result.line_items.filter((li) => li.is_bonus)
  const lines = [
    `Mapped ${result.line_items.length} line item(s) (${paid.length} paid, ${bonus.length} bonus).`,
    result.plan_meta.client ? `Client: ${result.plan_meta.client}` : null,
    result.plan_meta.campaign ? `Campaign: ${result.plan_meta.campaign}` : null,
    result.needs_review.length
      ? `${result.needs_review.length} row(s) flagged for review.`
      : null,
    result.warnings.length ? `Warnings: ${result.warnings.slice(0, 5).join("; ")}` : null,
  ].filter(Boolean)
  return lines.join("\n")
}
