import type { AutopopulateChannel } from "./types"

/** Stage 2 system prompt — classify/map only; never invent numbers. */
export function buildMapperSystemPrompt(channel: AutopopulateChannel): string {
  const fieldList =
    channel === "radio"
      ? `Radio fields (strings unless noted): network, station, platform, bid_strategy, buy_type, placement, format, duration, size, creative_targeting, creative, buying_demo, market, targeting_attribute. Booleans as "true"/"false" strings in fields if needed: fixed_cost_media, client_pays_for_media, budget_includes_fees, no_adserving (default false).`
      : `OOH fields: network, format, buy_type, placement, type, size, market, buying_demo, environment, location, unit_rate. Booleans as above (default false).`

  return `You convert a detected media-owner plan grid into Assembled View line items. You CLASSIFY and MAP only — you NEVER invent, round, or recompute numbers. Every rate, cost, quantity and date you output must be copied verbatim from a cell in the provided grid, or omitted.

You receive: the target channel (${channel}), a DetectedSheet (metadata, headerRow, lineItemColumns, flight band + granularity, costColumns, junkColumns, and the raw grid), and the target output schema.

${fieldList}

Money / burst budget (authoritative copy rule):
- Prefer an investment / media value / market value / total / client rate investment cell when present on the row (or prorated across populated flight columns when the sheet only has a row total).
- Only fall back to rate × spots when both values are explicit cells AND no investment/total cell is usable.
- Never invent a budget figure.

Rules:
1. Identify data rows vs group/subtotal/header rows. Group rows (e.g. a State or Network name with no rate/quantity of its own) are context, NOT line items — attach their label to the child rows as network/market where appropriate.
2. One output line item per real media line. Map descriptor cells to schema fields. Leave a field "" if the plan doesn't specify it. Do not fabricate.
3. Bursts: for each flight column (or contiguous run of columns) that holds a quantity/spend for this line, emit one burst with startDate/endDate from that column's date(s) and money/quantity from the row's cell. When granularity is textMonthWeekly, flight.columns[].date are synthesised ISO week-start dates from year/month/week-number headers — still use those dates; do not invent a different calendar.
4. Bonus/added-value lines or sheets: set is_bonus=true and do NOT add them to paid budget.
5. Metadata: fill plan_meta (client, campaign, demo, start/end) from the grid even if it sits in an odd place. If a value is absent, omit it — never guess.
6. Every number you output must be traceable to a cell. If you are <80% sure of a mapping, put the line in needs_review with a one-line reason instead of guessing.
7. channel on every line_item must be "${channel}".

Return ONLY via the emit_mapped_plan tool.`
}

export const EMIT_MAPPED_PLAN_TOOL_NAME = "emit_mapped_plan"

export const EMIT_MAPPED_PLAN_TOOL = {
  name: EMIT_MAPPED_PLAN_TOOL_NAME,
  description:
    "Emit the mapped Assembled View plan (plan_meta, line_items, needs_review, warnings). Numbers must be copied from the grid.",
  input_schema: {
    type: "object",
    properties: {
      plan_meta: {
        type: "object",
        properties: {
          client: { type: "string" },
          campaign: { type: "string" },
          demo: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
        },
        additionalProperties: false,
      },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            channel: { type: "string", enum: ["radio", "ooh"] },
            fields: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            bursts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  startDate: { type: "string" },
                  endDate: { type: "string" },
                  budget: { type: "string" },
                  buyAmount: { type: "string" },
                  quantity: { type: "number" },
                  calculatedValue: { type: "number" },
                  sourceCell: { type: "string" },
                },
                required: ["startDate", "endDate"],
                additionalProperties: false,
              },
            },
            is_bonus: { type: "boolean" },
            confidence: { type: "number" },
            needs_review: { type: "string" },
          },
          required: ["channel", "fields", "bursts", "confidence"],
          additionalProperties: false,
        },
      },
      needs_review: {
        type: "array",
        items: {
          type: "object",
          properties: {
            row: { type: "number" },
            reason: { type: "string" },
          },
          required: ["row", "reason"],
          additionalProperties: false,
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["plan_meta", "line_items", "needs_review", "warnings"],
    additionalProperties: false,
  },
} as const
