import type AvaTool from "./types"
import {
  BUY_TYPES_WITH_DERIVED_DELIVERABLES,
  type BuyType,
} from "@/lib/mediaplan/deliverableBudget"
import { solveMediaMath } from "@/lib/mediaplan/solveMediaMath"

const BUY_TYPE_ENUM = [...BUY_TYPES_WITH_DERIVED_DELIVERABLES] as BuyType[]

function asFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

export const calculateMediaMathTool: AvaTool = {
  definition: {
    name: "calculate_media_math",
    description:
      "Solve the missing one of budget, rate, and deliverables for a media buy type. This tool NEVER writes to the form — it answers only. If the user wants the number applied, that is adjust_line_items. Pass buyType plus exactly two of { budget, rate, deliverables }. For weekly_rate / monthly_rate you may pass weeks / months instead of deliverables.",
    input_schema: {
      type: "object",
      properties: {
        buyType: {
          type: "string",
          enum: BUY_TYPE_ENUM,
          description: "Buy type from deliverableBudget (cpm, cpc, spots, weekly_rate, …).",
        },
        budget: {
          type: "number",
          description: "Media budget in dollars (net of fee split).",
        },
        rate: {
          type: "number",
          description: "Unit rate (CPM, CPC, spot rate, weekly rate, …).",
        },
        deliverables: {
          type: "number",
          description: "Impressions, clicks, spots, weeks, or other units for the buy type.",
        },
        weeks: {
          type: "number",
          description: "Optional week count for weekly_rate (alias of deliverables).",
        },
        months: {
          type: "number",
          description: "Optional month count for monthly_rate (alias of deliverables).",
        },
      },
      required: ["buyType"],
      additionalProperties: false,
    },
  },
  async execute(input, _context) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return {
        content: "calculate_media_math requires buyType and exactly two of budget, rate, deliverables.",
        isError: true,
      }
    }
    const body = input as Record<string, unknown>
    const result = solveMediaMath({
      buyType: String(body.buyType ?? ""),
      budget: asFiniteNumber(body.budget),
      rate: asFiniteNumber(body.rate),
      deliverables: asFiniteNumber(body.deliverables),
      weeks: asFiniteNumber(body.weeks),
      months: asFiniteNumber(body.months),
    })
    if (!result.ok) {
      return { content: result.reason, isError: true }
    }
    const rounding =
      result.roundingApplied.length > 0
        ? `Rounding applied: ${result.roundingApplied.join("; ")}.`
        : "No rounding was applied (values already on cents / whole units)."
    const content = [
      `Solved ${result.solvedField}: ${result.solvedValue}`,
      `Formula: ${result.formula}`,
      `Inputs echoed: buyType=${result.echoedInputs.buyType}` +
        (result.echoedInputs.budget != null ? ` budget=${result.echoedInputs.budget}` : "") +
        (result.echoedInputs.rate != null ? ` rate=${result.echoedInputs.rate}` : "") +
        (result.echoedInputs.deliverables != null
          ? ` deliverables=${result.echoedInputs.deliverables}`
          : "") +
        (result.echoedInputs.weeks != null ? ` weeks=${result.echoedInputs.weeks}` : "") +
        (result.echoedInputs.months != null ? ` months=${result.echoedInputs.months}` : ""),
      `Triple: budget=${result.triple.budget} rate=${result.triple.rate} deliverables=${result.triple.deliverables}`,
      rounding,
      "Nothing was written to the form. To apply a number, use adjust_line_items after the user confirms.",
    ].join("\n")
    return { content, isError: false }
  },
}
