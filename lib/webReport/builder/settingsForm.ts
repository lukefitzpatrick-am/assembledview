import { elementSettings, type WebElementId } from "@/lib/webReport/elements"

export type SettingsField = {
  key: string
  optional: boolean
  label: string
} & (
  | { kind: "enum"; options: string[] }
  | { kind: "string" }
  | { kind: "number"; integer: boolean; min?: number; max?: number }
  | { kind: "boolean" }
  | { kind: "enumList"; options: string[]; min?: number; max?: number }
  | { kind: "stringList"; min?: number; max?: number }
  | { kind: "objectList"; fields: SettingsField[]; min?: number; max?: number }
)

type ZodNode = {
  def: {
    type?: string
    entries?: Record<string, string>
    element?: ZodNode
    innerType?: ZodNode
    checks?: ZodCheck[]
  }
  shape?: Record<string, ZodNode>
}

type ZodCheck = {
  check?: string
  value?: number
  minimum?: number
  maximum?: number
  isInt?: boolean
  def?: { format?: string }
  _zod?: { def?: { check?: string; value?: number; minimum?: number; maximum?: number } }
}

const FIELD_LABEL: Record<string, string> = {
  tiles: "Tiles",
  bars: "Bars",
  columns: "Columns",
  topN: "Rows",
  showChange: "Show change",
  shade: "Shade",
  mode: "Queries",
  text: "Note",
  kind: "Kind",
  metric: "Metric",
  eventName: "Key event",
  eventNames: "Events",
  eventTiles: "Event tiles",
  label: "Label",
  compare: "Show % change vs previous period",
  platform: "Platform",
  campaignContains: "Campaign name contains",
  kpiId: "Saved KPI",
  kpiIds: "Saved KPIs",
  months: "Months",
  target: "Target",
}

function checkOf(check: ZodCheck) {
  const nested = check._zod?.def
  return {
    check: check.check ?? nested?.check,
    value: check.value ?? nested?.value,
    minimum: check.minimum ?? nested?.minimum,
    maximum: check.maximum ?? nested?.maximum,
  }
}

function bounds(schema: ZodNode): { min?: number; max?: number; integer: boolean } {
  let min: number | undefined
  let max: number | undefined
  let integer = false
  for (const check of schema.def.checks ?? []) {
    const item = checkOf(check)
    if (check.isInt || check.def?.format === "safeint") integer = true
    if (item.check === "greater_than" && item.value != null) min = item.value
    if (item.check === "less_than" && item.value != null) max = item.value
    if (item.check === "min_length" && item.minimum != null) min = item.minimum
    if (item.check === "max_length" && item.maximum != null) max = item.maximum
  }
  return { min, max, integer }
}

function enumOptions(schema: ZodNode): string[] {
  return Object.values(schema.def.entries ?? {})
}

function unwrap(schema: ZodNode): { schema: ZodNode; optional: boolean } {
  let current = schema
  let optional = false
  while (
    (current.def.type === "optional" || current.def.type === "default") &&
    current.def.innerType
  ) {
    if (current.def.type === "optional") optional = true
    current = current.def.innerType
  }
  return { schema: current, optional }
}

function describeNode(key: string, raw: ZodNode): SettingsField | null {
  const { schema, optional } = unwrap(raw)
  const label = FIELD_LABEL[key] ?? key
  const type = schema.def.type
  if (type === "enum") {
    return { kind: "enum", key, optional, label, options: enumOptions(schema) }
  }
  if (type === "string") return { kind: "string", key, optional, label }
  if (type === "boolean") return { kind: "boolean", key, optional, label }
  if (type === "number") {
    const { min, max, integer } = bounds(schema)
    return { kind: "number", key, optional, label, integer, min, max }
  }
  if (type === "array" && schema.def.element) {
    const { min, max } = bounds(schema)
    const element = unwrap(schema.def.element).schema
    if (element.def.type === "enum") {
      return { kind: "enumList", key, optional, label, options: enumOptions(element), min, max }
    }
    if (element.def.type === "string") {
      return { kind: "stringList", key, optional, label, min, max }
    }
    if (element.def.type === "object" && element.shape) {
      const fields = Object.entries(element.shape).flatMap(([childKey, child]) => {
        const described = describeNode(childKey, child)
        return described ? [described] : []
      })
      return { kind: "objectList", key, optional, label, fields, min, max }
    }
  }
  return null
}

/** Field list for one element's settings, read from its zod object. */
export function describeElementSettings(id: WebElementId): SettingsField[] {
  const schema = elementSettings[id] as unknown as ZodNode
  if (!schema.shape) return []
  return Object.entries(schema.shape).flatMap(([key, field]) => {
    const described = describeNode(key, field)
    return described ? [described] : []
  })
}
