import type AvaTool from "./types"
import { toChatFileAttachment } from "@/lib/ava/chatFileAttachment"
import {
  buildPerformanceReport,
  type PerformanceReportPayload,
} from "@/lib/reports/buildPerformanceReport"
import {
  PPTX_CONTENT_TYPE,
  storePerformanceReport,
} from "@/lib/reports/storePerformanceReport"
import { asRecord, asString, jsonContent, resolveScopedMba } from "./helpers"

type CapViolation = { field: string; cap: number; length: number }

function singleLine(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function requireString(
  value: unknown,
  field: string,
  cap: number,
  violations: CapViolation[],
): string {
  const text = singleLine(value)
  if (text.length > cap) {
    violations.push({ field, cap, length: text.length })
  }
  return text
}

function requireExactStringArray(
  value: unknown,
  field: string,
  count: number,
  cap: number,
  violations: CapViolation[],
): string[] | null {
  if (!Array.isArray(value) || value.length !== count) {
    return null
  }
  return value.map((item, i) => requireString(item, `${field}[${i}]`, cap, violations))
}

function requireSteps(
  value: unknown,
  violations: CapViolation[],
): PerformanceReportPayload["steps"] | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  const steps = value.map((raw, i) => {
    const row = asRecord(raw)
    return {
      when: requireString(row.when, `steps[${i}].when`, 16, violations),
      what: requireString(row.what, `steps[${i}].what`, 40, violations),
    }
  })
  return steps as PerformanceReportPayload["steps"]
}

function validatePayload(
  args: Record<string, unknown>,
):
  | { ok: true; clientName: string; reportMonth: string; mbaHint?: string; payload: PerformanceReportPayload }
  | { ok: false; content: string } {
  const violations: CapViolation[] = []
  const clientName = requireString(args.clientName, "clientName", 40, violations)
  const reportMonth = requireString(args.reportMonth, "reportMonth", 20, violations)
  const mbaHint = asString(args.mbaNumber) ?? asString(args.mba)

  const channels = requireExactStringArray(args.channels, "channels", 4, 90, violations)
  const kpis = requireExactStringArray(args.kpis, "kpis", 4, 90, violations)
  const insights = requireExactStringArray(args.insights, "insights", 3, 110, violations)
  const steps = requireSteps(args.steps, violations)

  if (!clientName) {
    return { ok: false, content: "clientName is required." }
  }
  if (!reportMonth) {
    return { ok: false, content: "reportMonth is required." }
  }
  if (!channels) {
    return { ok: false, content: "channels must be an array of exactly 4 strings (≤90 each)." }
  }
  if (!kpis) {
    return { ok: false, content: "kpis must be an array of exactly 4 strings (≤90 each)." }
  }
  if (!insights) {
    return { ok: false, content: "insights must be an array of exactly 3 strings (≤110 each)." }
  }
  if (!steps) {
    return {
      ok: false,
      content: "steps must be an array of exactly 4 { when ≤16, what ≤40 } objects.",
    }
  }

  const payload: PerformanceReportPayload = {
    execSummary: requireString(args.execSummary, "execSummary", 120, violations),
    deliverySpend: requireString(args.deliverySpend, "deliverySpend", 140, violations),
    deliveryDeliverables: requireString(
      args.deliveryDeliverables,
      "deliveryDeliverables",
      140,
      violations,
    ),
    channels: channels as PerformanceReportPayload["channels"],
    kpis: kpis as PerformanceReportPayload["kpis"],
    keyInsight: requireString(args.keyInsight, "keyInsight", 240, violations),
    insights: insights as PerformanceReportPayload["insights"],
    recsInFlight: requireString(args.recsInFlight, "recsInFlight", 140, violations),
    recsNextPeriod: requireString(args.recsNextPeriod, "recsNextPeriod", 140, violations),
    steps,
  }

  if (violations.length) {
    const first = violations[0]!
    return {
      ok: false,
      content: jsonContent({
        error: "field_too_long",
        field: first.field,
        cap: first.cap,
        length: first.length,
        message: `Shorten ${first.field} to ≤${first.cap} characters (got ${first.length}).`,
        violations,
      }),
    }
  }

  return { ok: true, clientName, reportMonth, mbaHint: mbaHint || undefined, payload }
}

export const generatePerformanceReportTool: AvaTool = {
  definition: {
    name: "generate_performance_report",
    description:
      "Build the client performance report deck (.pptx) for the campaign on the page and return a download card. Call ONLY after the user has explicitly confirmed the reviewed narrative in chat. All strings single-line.",
    input_schema: {
      type: "object",
      properties: {
        clientName: {
          type: "string",
          description: "Client display name (≤40).",
        },
        mbaNumber: {
          type: "string",
          description: "Optional MBA — defaults to page context via resolveScopedMba.",
        },
        mba: {
          type: "string",
          description: "Alias for mbaNumber.",
        },
        reportMonth: {
          type: "string",
          description: 'Report month label (≤20), e.g. "Jul 2026".',
        },
        execSummary: { type: "string", description: "Executive summary (≤120)." },
        deliverySpend: { type: "string", description: "Spend vs plan line (≤140)." },
        deliveryDeliverables: {
          type: "string",
          description: "Deliverables vs plan line (≤140).",
        },
        channels: {
          type: "array",
          description: "Exactly 4 channel commentary lines (≤90 each).",
          items: { type: "string" },
          minItems: 4,
          maxItems: 4,
        },
        kpis: {
          type: "array",
          description: "Exactly 4 KPI lines (≤90 each).",
          items: { type: "string" },
          minItems: 4,
          maxItems: 4,
        },
        keyInsight: { type: "string", description: "Key insight headline (≤240)." },
        insights: {
          type: "array",
          description: "Exactly 3 insight lines (≤110 each).",
          items: { type: "string" },
          minItems: 3,
          maxItems: 3,
        },
        recsInFlight: {
          type: "string",
          description: "In-flight recommendations (≤140).",
        },
        recsNextPeriod: {
          type: "string",
          description: "Next-period recommendations (≤140).",
        },
        steps: {
          type: "array",
          description: "Exactly 4 next steps with when (≤16) and what (≤40).",
          items: {
            type: "object",
            properties: {
              when: { type: "string" },
              what: { type: "string" },
            },
            required: ["when", "what"],
            additionalProperties: false,
          },
          minItems: 4,
          maxItems: 4,
        },
      },
      required: [
        "clientName",
        "reportMonth",
        "execSummary",
        "deliverySpend",
        "deliveryDeliverables",
        "channels",
        "kpis",
        "keyInsight",
        "insights",
        "recsInFlight",
        "recsNextPeriod",
        "steps",
      ],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        content:
          "Performance report export is unavailable: BLOB_READ_WRITE_TOKEN is not configured.",
        isError: true,
      }
    }

    const args = asRecord(input)
    const validated = validatePayload(args)
    if (!validated.ok) {
      return { content: validated.content, isError: true }
    }

    const scopedMba = resolveScopedMba(context, validated.mbaHint)
    if (!scopedMba.ok) return { content: scopedMba.error, isError: true }
    if (!scopedMba.mba) {
      return {
        content: "mbaNumber is required to generate a performance report (page context or argument).",
        isError: true,
      }
    }

    try {
      const buffer = await buildPerformanceReport(validated.payload)
      const fileName = `${validated.clientName} ${scopedMba.mba} performance report ${validated.reportMonth}.pptx`
      const exportResult = await storePerformanceReport(scopedMba.mba, fileName, buffer)

      const attachment = toChatFileAttachment({
        fileName: exportResult.filename,
        url: `/api/reports/download?path=${encodeURIComponent(exportResult.pathname)}`,
        contentType: PPTX_CONTENT_TYPE,
        sizeBytes: buffer.byteLength,
      })

      return {
        content: jsonContent({
          filename: exportResult.filename,
          note:
            "A download card is shown in the chat UI — reply briefly (e.g. Report ready); do not paste a download URL or markdown link.",
        }),
        attachments: [attachment],
        isError: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: `Failed to generate performance report: ${message}`, isError: true }
    }
  },
}
