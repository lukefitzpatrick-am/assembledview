/**
 * Port of validate_content in
 * scripts/spikes/report-deck-skill/av-campaign-report-v5/scripts/build_report.py.
 * A value key must resolve to a string leaf in the slim payload. A digit in
 * copy that is not already in that payload fails as a figure that was not supplied.
 */

const KEY_RE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/

const SLIDE_TYPES = [
  "cover",
  "summary",
  "channel",
  "not-live",
  "kpi",
  "iao",
  "appendix",
  "close",
] as const

const proseSchema = {
  anyOf: [
    { type: "string" },
    {
      type: "array",
      items: {
        anyOf: [
          { type: "string" },
          {
            type: "object",
            additionalProperties: false,
            required: ["k"],
            properties: { k: { type: "string" } },
          },
        ],
      },
    },
  ],
} as const

const statSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "key"],
  properties: {
    label: proseSchema,
    key: { type: "string" },
    note: proseSchema,
  },
} as const

const deliverySchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "key"],
  properties: {
    label: proseSchema,
    key: { type: "string" },
  },
} as const

const cardSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "key", "body"],
  properties: {
    title: proseSchema,
    key: { type: "string" },
    body: proseSchema,
  },
} as const

const notLiveCardSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "budget", "status"],
  properties: {
    label: proseSchema,
    budget: { type: "string" },
    status: proseSchema,
    note: proseSchema,
  },
} as const

const notLiveRowSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "budget", "note"],
  properties: {
    label: proseSchema,
    budget: { type: "string" },
    note: proseSchema,
  },
} as const

const kpiEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "actual", "target"],
  properties: {
    label: { type: "string" },
    actual: { type: "string" },
    target: { type: "string" },
  },
} as const

const iaoRowSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tag", "text"],
  properties: {
    tag: { type: "string", enum: ["insight", "action", "outcome"] },
    text: proseSchema,
  },
} as const

const journeyStepSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "text"],
  properties: {
    label: proseSchema,
    text: proseSchema,
  },
} as const

/** JSON schema sent as output_config.format. Digits and payload keys are checked in TypeScript. */
export const DECK_CONTENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["slides"],
  properties: {
    slides: {
      type: "array",
      minItems: 5,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title"],
        properties: {
          type: { type: "string", enum: [...SLIDE_TYPES] },
          variant: { type: ["string", "null"] },
          title: { type: "string" },
          subtitle: { type: "string" },
          support: proseSchema,
          stats: { type: "array", items: statSchema },
          outcome: proseSchema,
          spend: { type: "string" },
          expected: { type: "string" },
          spendLabel: proseSchema,
          expectedLabel: proseSchema,
          delivery: { type: "array", items: deliverySchema },
          insight: proseSchema,
          cards: { type: "array", items: { anyOf: [cardSchema, notLiveCardSchema, kpiEntrySchema] } },
          value: { type: "string" },
          body: proseSchema,
          photo: { type: "integer", enum: [0, 1, 2] },
          rows: {
            anyOf: [
              { type: "array", items: { anyOf: [notLiveRowSchema, iaoRowSchema, kpiEntrySchema] } },
              { type: "array", items: { type: "array", items: { type: "string" } } },
            ],
          },
          steps: { type: "array", items: journeyStepSchema },
          columns: { type: "array", items: proseSchema },
          button: proseSchema,
        },
      },
    },
  },
}

type Slide = Record<string, unknown>

function isSlide(value: unknown): value is Slide {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function wordCount(text: string): number {
  return text.match(/\S+/g)?.length ?? 0
}

function serifMatches(title: string): RegExpMatchArray[] {
  return [...title.matchAll(/\{i:"([^"]*)"\}/g)]
}

function visibleTitle(title: string): string {
  return title.replace(/\{i:"([^"]*)"\}/g, "$1")
}

function resolveKey(payload: unknown, key: string): unknown {
  let current: unknown = payload
  for (const part of key.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(part)
      if (!Number.isInteger(index) || part !== String(index)) return undefined
      current = current[index]
    } else if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

function payloadCorpus(payload: unknown): string {
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (typeof node === "string") parts.push(node)
    else if (typeof node === "number" && Number.isFinite(node)) parts.push(String(node))
    else if (Array.isArray(node)) node.forEach(walk)
    else if (node !== null && typeof node === "object") Object.values(node).forEach(walk)
  }
  walk(payload)
  return parts.join("\n")
}

function digitMessage(text: string, corpus: string): string | null {
  const match = text.match(/\d[\d,]*(?:\.\d+)?/)
  if (!match) return null
  const figure = match[0]
  const bare = figure.replace(/,/g, "")
  if (corpus.includes(figure) || corpus.includes(bare)) return "digits in copy; use a value key"
  return `${figure} is not in the payload`
}

function spanLabel(low: number, high: number | null): string {
  if (low === high) return String(low)
  if (high == null) return `at least ${low}`
  return `${low} to ${high}`
}

export function validateDeckContent(content: unknown, payload: unknown): string[] {
  const errors: string[] = []
  const corpus = payloadCorpus(payload)
  const bad = (path: string, message: string) => {
    errors.push(`${path}: ${message}`)
  }

  const key = (node: unknown, path: string) => {
    if (typeof node !== "string" || !KEY_RE.test(node)) {
      bad(path, "expected a value key")
      return
    }
    if (typeof resolveKey(payload, node) !== "string") {
      bad(path, `${node} is not in the payload`)
    }
  }

  const prose = (node: unknown, path: string, limit?: number, words?: number) => {
    if (node == null) {
      bad(path, "missing")
      return
    }
    if (typeof node === "string" && KEY_RE.test(node)) {
      if (typeof resolveKey(payload, node) !== "string") {
        bad(path, `${node} is not in the payload`)
      }
      return
    }
    if (typeof node === "string") {
      const digits = digitMessage(node, corpus)
      if (digits) bad(path, digits)
      else if (limit != null && node.length > limit) bad(path, `${node.length} characters, limit ${limit}`)
      if (words != null && wordCount(node) > words) bad(path, `over ${words} words`)
      return
    }
    if (Array.isArray(node)) {
      let length = 0
      let count = 0
      node.forEach((part, index) => {
        const at = `${path}.${index}`
        if (typeof part === "string") {
          const digits = digitMessage(part, corpus)
          if (digits) bad(at, digits)
          length += part.length
          count += wordCount(part)
        } else if (
          isSlide(part) &&
          typeof part.k === "string" &&
          Object.keys(part).length === 1
        ) {
          if (!KEY_RE.test(part.k)) bad(`${at}.k`, "expected a value key")
          else if (typeof resolveKey(payload, part.k) !== "string") {
            bad(`${at}.k`, `${part.k} is not in the payload`)
          }
          count += 1
        } else {
          bad(at, 'expected copy or {"k": path}')
        }
      })
      if (limit != null && length > limit) bad(path, `${length} characters, limit ${limit}`)
      if (words != null && count > words) bad(path, `over ${words} words`)
      return
    }
    bad(path, "expected copy or a value key")
  }

  const title = (spec: Slide, path: string) => {
    if (!("title" in spec)) {
      bad(`${path}.title`, "missing title")
      return
    }
    const value = spec.title
    const at = `${path}.title`
    if (typeof value !== "string") {
      bad(at, "title must be a string")
      return
    }
    if (serifMatches(value).length > 1) {
      bad(at, "one serif phrase")
      return
    }
    const visible = visibleTitle(value)
    const digits = digitMessage(visible, corpus)
    if (digits) bad(at, digits)
    else if (visible.length > 60) bad(at, `${visible.length} characters, limit 60`)
    if (!visible.endsWith(".")) bad(at, "title must end with a full stop")
  }

  const variantName = (spec: Slide, path: string, allowed: readonly string[]): string | null => {
    const name = spec.variant
    if (typeof name !== "string" || !allowed.includes(name)) {
      bad(path, `variant must be ${allowed.join(" or ")}`)
      return null
    }
    return name
  }

  const items = (node: unknown, path: string, low: number, high: number | null, noun: string): unknown[] => {
    if (!Array.isArray(node) || node.length < low || (high != null && node.length > high)) {
      bad(path, `${spanLabel(low, high)} ${noun}`)
      return []
    }
    return node
  }

  if (!isSlide(content) || !Array.isArray(content.slides) || content.slides.length === 0) {
    return ["slides: expected a slide list"]
  }

  content.slides.forEach((spec, index) => {
    const path = `slides.${index}`
    if (!isSlide(spec)) {
      bad(path, "expected an object")
      return
    }
    const kind = spec.type
    if (typeof kind !== "string" || !(SLIDE_TYPES as readonly string[]).includes(kind)) {
      bad(path, "unknown slide type")
      return
    }
    title(spec, path)
    if (kind === "cover") {
      const name = variantName(spec, path, ["sand", "black"])
      if (name != null) key(spec.subtitle, `${path}.subtitle`)
    } else if (kind === "summary") {
      const name = variantName(spec, path, ["stat-row", "statement"])
      if (name === "statement") prose(spec.support, `${path}.support`, 140)
      else if (name === "stat-row") {
        items(spec.stats, `${path}.stats`, 1, 4, "stats").forEach((item, itemIndex) => {
          const at = `${path}.stats.${itemIndex}`
          if (!isSlide(item)) {
            bad(at, "expected an object")
            return
          }
          prose(item.label, `${at}.label`, 24)
          key(item.key, `${at}.key`)
          if (item.note != null) prose(item.note, `${at}.note`, 48)
        })
        prose(spec.outcome, `${path}.outcome`, 160)
      }
    } else if (kind === "channel") {
      const name = variantName(spec, path, ["bars", "cards", "photo"])
      if (name === "bars") {
        key(spec.spend, `${path}.spend`)
        key(spec.expected, `${path}.expected`)
        if (spec.spendLabel != null) prose(spec.spendLabel, `${path}.spendLabel`, 24)
        if (spec.expectedLabel != null) prose(spec.expectedLabel, `${path}.expectedLabel`, 24)
        items(spec.delivery, `${path}.delivery`, 1, 4, "delivery figures").forEach((item, itemIndex) => {
          const at = `${path}.delivery.${itemIndex}`
          if (!isSlide(item)) {
            bad(at, "expected an object")
            return
          }
          prose(item.label, `${at}.label`, 24)
          key(item.key, `${at}.key`)
        })
        prose(spec.insight, `${path}.insight`, 160)
      } else if (name === "cards") {
        items(spec.cards, `${path}.cards`, 3, 3, "cards").forEach((item, itemIndex) => {
          const at = `${path}.cards.${itemIndex}`
          if (!isSlide(item)) {
            bad(at, "expected an object")
            return
          }
          prose(item.title, `${at}.title`, 32)
          key(item.key, `${at}.key`)
          prose(item.body, `${at}.body`, 120)
        })
      } else if (name === "photo") {
        key(spec.value, `${path}.value`)
        prose(spec.body, `${path}.body`, 200)
        const photo = spec.photo === undefined ? 0 : spec.photo
        if (typeof photo !== "number" || !Number.isInteger(photo) || photo < 0 || photo > 2) {
          bad(`${path}.photo`, "photo index out of range")
        }
      }
    } else if (kind === "not-live") {
      const name = variantName(spec, path, ["cards", "list"])
      if (name === "cards") {
        items(spec.cards, `${path}.cards`, 1, 4, "cards").forEach((item, itemIndex) => {
          const at = `${path}.cards.${itemIndex}`
          if (!isSlide(item)) {
            bad(at, "expected an object")
            return
          }
          prose(item.label, `${at}.label`, 32)
          key(item.budget, `${at}.budget`)
          prose(item.status, `${at}.status`, 48)
          if (item.note != null) prose(item.note, `${at}.note`, 80)
        })
      } else if (name === "list") {
        const rows = items(spec.rows, `${path}.rows`, 1, 5, "rows")
        if (rows.length > 0 && rows.length <= 2) {
          bad(`${path}.rows`, "list is not allowed for 1 or 2 channels; use cards")
        }
        rows.forEach((item, itemIndex) => {
          const at = `${path}.rows.${itemIndex}`
          if (!isSlide(item)) {
            bad(at, "expected an object")
            return
          }
          prose(item.label, `${at}.label`, 32)
          key(item.budget, `${at}.budget`)
          prose(item.note, `${at}.note`, 80)
        })
      }
    } else if (kind === "kpi") {
      const name = variantName(spec, path, ["four-cards", "table"])
      if (name != null) {
        const group = name === "four-cards" ? "cards" : "rows"
        items(spec[group], `${path}.${group}`, 1, name === "four-cards" ? 4 : null, group).forEach(
          (item, itemIndex) => {
            const at = `${path}.${group}.${itemIndex}`
            if (!isSlide(item)) {
              bad(at, "expected an object")
              return
            }
            key(item.label, `${at}.label`)
            key(item.actual, `${at}.actual`)
            key(item.target, `${at}.target`)
          },
        )
        if (name === "table") prose(spec.insight, `${path}.insight`, 160)
      }
    } else if (kind === "iao") {
      const name = variantName(spec, path, ["rows", "journey"])
      if (name === "journey") {
        items(spec.steps, `${path}.steps`, 3, 3, "steps").forEach((item, itemIndex) => {
          const at = `${path}.steps.${itemIndex}`
          if (!isSlide(item)) {
            bad(at, "expected an object")
            return
          }
          prose(item.label, `${at}.label`, 24)
          prose(item.text, `${at}.text`, undefined, 35)
        })
      } else if (name === "rows") {
        items(spec.rows, `${path}.rows`, 1, 4, "rows").forEach((item, itemIndex) => {
          const at = `${path}.rows.${itemIndex}`
          if (!isSlide(item)) {
            bad(at, "expected an object")
            return
          }
          if (item.tag !== "insight" && item.tag !== "action" && item.tag !== "outcome") {
            bad(`${at}.tag`, "insight, action or outcome")
          }
          prose(item.text, `${at}.text`, undefined, 35)
        })
      }
    } else if (kind === "appendix") {
      if (spec.variant != null && spec.variant !== "table") bad(path, "variant must be table")
      const columns = spec.columns
      const columnList = Array.isArray(columns) && columns.length > 0 ? columns : []
      if (!Array.isArray(columns) || columns.length === 0) bad(`${path}.columns`, "at least one column")
      else columns.forEach((column, colIndex) => prose(column, `${path}.columns.${colIndex}`, 18))
      const rows = spec.rows
      if (!Array.isArray(rows) || rows.length === 0) bad(`${path}.rows`, "at least one row")
      else {
        rows.forEach((row, rowIndex) => {
          if (!Array.isArray(row) || row.length !== columnList.length) {
            bad(`${path}.rows.${rowIndex}`, `${columnList.length} keys`)
            return
          }
          row.forEach((cell, cellIndex) => key(cell, `${path}.rows.${rowIndex}.${cellIndex}`))
        })
      }
      prose(spec.insight, `${path}.insight`, 160)
    } else if (kind === "close") {
      const name = variantName(spec, path, ["thank-you", "cta"])
      if (name === "cta") {
        prose(spec.support, `${path}.support`, 140)
        prose(spec.button, `${path}.button`, 24)
      }
    }
  })

  return errors
}
