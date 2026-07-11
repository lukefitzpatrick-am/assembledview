import type { NamingTemplate, TemplateElement } from "./types"

/** DEFAULT(Q10): mmmyy retained */
export const MONTH_START_RE =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{2}$/

const SLUG_ALLOWED_RE = /[^a-z0-9_+x]/g

export function isCompositeElement(element: TemplateElement): boolean {
  return (
    element.source === "plan" &&
    (element.key === "campaign_name" || element.key === "io_name")
  )
}

/** Slugify a raw value for use in a composed name. */
export function slugify(raw: string): string {
  let s = raw.trim().toLowerCase()
  s = s.replace(/\s+/g, "_")
  s = s.replace(SLUG_ALLOWED_RE, "")
  // Collapse repeated runs of _, +, or x
  s = s.replace(/_+/g, "_")
  s = s.replace(/\++/g, "+")
  s = s.replace(/x{2,}/g, "x")
  return s
}

function resolveRawValue(
  element: TemplateElement,
  values: Record<string, string>,
): string | undefined {
  if (element.source === "literal") {
    return element.literal
  }
  const v = values[element.key]
  if (v === undefined || v === null) return undefined
  return v
}

/**
 * Compose a platform name from a template and element values.
 * Throws on empty required elements or values that still contain the separator
 * (except composite plan fields, which are pre-joined names).
 */
export function composeName(
  template: NamingTemplate,
  values: Record<string, string>,
): string {
  const segments: string[] = []

  for (const element of template.elements) {
    const raw = resolveRawValue(element, values)

    if (raw === undefined || String(raw).trim() === "") {
      if (element.optional) continue
      throw new Error(`Missing required element: ${element.key}`)
    }

    // Composite plan fields are already composed names containing the separator.
    if (isCompositeElement(element)) {
      const composed = String(raw).trim()
      segments.push(template.case === "lower" ? composed.toLowerCase() : composed)
      continue
    }

    if (element.key === "month_start") {
      const month = String(raw).trim().toLowerCase()
      if (!MONTH_START_RE.test(month)) {
        throw new Error(`Invalid month_start: ${raw}`)
      }
      segments.push(month)
      continue
    }

    const slug =
      element.source === "literal"
        ? slugify(String(element.literal ?? raw))
        : slugify(String(raw))

    if (!slug) {
      if (element.optional) continue
      throw new Error(`Empty slug for required element: ${element.key}`)
    }

    if (slug.includes(template.separator)) {
      throw new Error(
        `Value for ${element.key} contains separator "${template.separator}"`,
      )
    }

    segments.push(slug)
  }

  let name = segments.join(template.separator)
  if (template.case === "lower") {
    name = name.toLowerCase()
  }
  return name
}
