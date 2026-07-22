import { isCompositeElement, slugify } from "./compose"
import { getTemplate } from "./templates"
import type { NamingTemplate, TemplateElement } from "./types"
import { validateValue } from "./validate"

/**
 * Parse a composed name back into element values.
 * Returns null on mismatch (never throws).
 *
 * Fixed-position elements anchor from the front; terminal elements
 * (line_item_id, trailing literals) from the back; optionals absorb the
 * middle remainder in declared order. Composite elements (campaign_name,
 * io_name) anchor from the back: consume trailing elements first, then
 * treat the remaining prefix as the composite.
 */
export function parseName(
  template: NamingTemplate,
  name: string,
): Record<string, string> | null {
  if (!name || typeof name !== "string") return null

  const parts = name.split(template.separator)
  if (parts.some((p) => p.length === 0)) return null

  const elements = template.elements
  const compositeIdx = elements.findIndex(isCompositeElement)

  let result: Record<string, string> | null

  if (compositeIdx === 0) {
    result = parseCompositePrefix(template, parts)
  } else if (compositeIdx > 0) {
    return null // composite must be leading when present
  } else {
    result = parseFlat(elements, parts)
  }

  if (!result) return null

  // Validate extracted values (picklist, month, slug rules)
  for (const element of elements) {
    if (element.source === "literal") {
      if (result[element.key] !== undefined) {
        // literals are keyed by literal string in lit() helper — store under key
      }
      continue
    }
    const value = result[element.key]
    if (value === undefined) {
      if (element.optional) continue
      return null
    }
    if (isCompositeElement(element)) {
      // Composite is a joined name; do not run single-token slug validation
      continue
    }
    const check = validateValue(element, value)
    if (!check.ok) return null
  }

  return result
}

function parseFlat(
  elements: TemplateElement[],
  parts: string[],
): Record<string, string> | null {
  const required = elements.filter((e) => !e.optional)
  const optionals = elements.filter((e) => e.optional)
  const nReq = required.length
  const nOpt = optionals.length

  if (parts.length < nReq || parts.length > nReq + nOpt) return null

  const extras = parts.length - nReq // how many optionals are present
  const presentOptionals = new Set(
    optionals.slice(0, extras).map((e) => e.key),
  )

  const result: Record<string, string> = {}
  let pi = 0

  for (const element of elements) {
    if (element.optional && !presentOptionals.has(element.key)) {
      continue
    }

    if (pi >= parts.length) return null
    const token = parts[pi++]

    if (element.source === "literal") {
      if (token !== slugify(element.literal ?? "")) return null
      result[element.key] = token
      continue
    }

    result[element.key] = token
  }

  if (pi !== parts.length) return null
  return result
}

function trailingValuesOk(
  trailing: TemplateElement[],
  values: Record<string, string>,
): boolean {
  for (const el of trailing) {
    if (el.source === "literal") continue
    const v = values[el.key]
    if (v === undefined) {
      if (el.optional) continue
      return false
    }
    if (!validateValue(el, v).ok) return false
  }
  return true
}

function parentTemplateForComposite(
  platform: string,
  compositeKey: string,
): NamingTemplate | undefined {
  if (compositeKey === "campaign_name") {
    return getTemplate(platform, "campaign")
  }
  if (compositeKey === "io_name") {
    return getTemplate(platform, "insertion_order")
  }
  return undefined
}

/**
 * When the leading composite is itself a composed parent name, require the
 * candidate prefix to parse under that parent template. This disambiguates
 * optional trailing free tokens (e.g. Meta ad_set geo after free()-ing geo)
 * without hard picklist rejection at validate/compose time.
 */
function compositeParentParses(
  platform: string,
  compositeKey: string,
  compositeName: string,
): boolean {
  const parent = parentTemplateForComposite(platform, compositeKey)
  if (!parent) return true
  return parseName(parent, compositeName) !== null
}

function parseCompositePrefix(
  template: NamingTemplate,
  parts: string[],
): Record<string, string> | null {
  const elements = template.elements
  const separator = template.separator
  const composite = elements[0]
  const trailing = elements.slice(1)

  const minTrailing = trailing.filter((e) => !e.optional).length
  const maxTrailing = trailing.length

  if (parts.length < minTrailing + 1) return null

  // Try longest trailing first (optionals filled), then shorter.
  // Parent-template parse + picklist/slug validation disambiguate when a
  // composite token could otherwise be mistaken for a trailing element.
  const upper = Math.min(maxTrailing, parts.length - 1)
  for (let trailingLen = upper; trailingLen >= minTrailing; trailingLen--) {
    const trailingParts = parts.slice(parts.length - trailingLen)
    const compositeParts = parts.slice(0, parts.length - trailingLen)
    if (compositeParts.length === 0) continue

    const trailingResult = parseFlat(trailing, trailingParts)
    if (!trailingResult) continue
    if (!trailingValuesOk(trailing, trailingResult)) continue

    const compositeName = compositeParts.join(separator)
    if (
      !compositeParentParses(template.platform, composite.key, compositeName)
    ) {
      continue
    }

    return {
      [composite.key]: compositeName,
      ...trailingResult,
    }
  }

  return null
}
