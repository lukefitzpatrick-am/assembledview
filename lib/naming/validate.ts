import { MONTH_START_RE, slugify } from "./compose"
import { PICKLISTS, TEMPLATES } from "./templates"
import type { NamingTemplate, TemplateElement } from "./types"

export interface ValidationIssue {
  platform?: string
  level?: string
  message: string
}

export interface ValueValidation {
  ok: boolean
  message?: string
}

/**
 * Structural validation of all registered templates.
 * - Every platform exactly one pacing grain
 * - line_item_id terminal + present on that grain
 * - No two adjacent optional elements
 * - Literals non-empty
 * - Picklist refs exist
 */
export function validateTemplates(
  templates: NamingTemplate[] = TEMPLATES,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const byPlatform = new Map<string, NamingTemplate[]>()

  for (const t of templates) {
    const list = byPlatform.get(t.platform) ?? []
    list.push(t)
    byPlatform.set(t.platform, list)

    // Adjacent optionals
    for (let i = 0; i < t.elements.length - 1; i++) {
      if (t.elements[i].optional && t.elements[i + 1].optional) {
        issues.push({
          platform: t.platform,
          level: t.level,
          message: `Adjacent optional elements: ${t.elements[i].key} and ${t.elements[i + 1].key}`,
        })
      }
    }

    for (const el of t.elements) {
      if (el.source === "literal") {
        if (!el.literal || !String(el.literal).trim()) {
          issues.push({
            platform: t.platform,
            level: t.level,
            message: `Empty literal for element key=${el.key}`,
          })
        }
      }
      if (el.source === "picklist") {
        if (!el.picklist || !(el.picklist in PICKLISTS)) {
          issues.push({
            platform: t.platform,
            level: t.level,
            message: `Unknown picklist "${el.picklist}" on element ${el.key}`,
          })
        }
      }
    }

    if (t.isPacingGrain) {
      const last = t.elements[t.elements.length - 1]
      const lineItemEls = t.elements.filter((e) => e.isLineItemId)
      if (lineItemEls.length !== 1) {
        issues.push({
          platform: t.platform,
          level: t.level,
          message: `Pacing grain must have exactly one isLineItemId element (found ${lineItemEls.length})`,
        })
      } else if (!last?.isLineItemId) {
        issues.push({
          platform: t.platform,
          level: t.level,
          message: `isLineItemId must be terminal on pacing grain (last element is ${last?.key})`,
        })
      } else if (last.source !== "plan") {
        issues.push({
          platform: t.platform,
          level: t.level,
          message: `Terminal line_item_id must have source "plan"`,
        })
      }
    } else {
      const lineItemEls = t.elements.filter((e) => e.isLineItemId)
      if (lineItemEls.length > 0) {
        issues.push({
          platform: t.platform,
          level: t.level,
          message: `isLineItemId only allowed on pacing-grain levels`,
        })
      }
    }
  }

  for (const [platform, list] of byPlatform) {
    const grains = list.filter((t) => t.isPacingGrain)
    if (grains.length !== 1) {
      issues.push({
        platform,
        message: `Platform must have exactly one isPacingGrain level (found ${grains.length})`,
      })
    }
  }

  return issues
}

/**
 * Validate a single element value against slug rules, picklist membership,
 * and month format.
 */
export function validateValue(
  element: TemplateElement,
  value: string,
): ValueValidation {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (element.optional) return { ok: true }
    return { ok: false, message: `Empty value for ${element.key}` }
  }

  const raw = String(value).trim()

  if (element.key === "month_start") {
    const month = raw.toLowerCase()
    if (!MONTH_START_RE.test(month)) {
      return { ok: false, message: `Invalid month_start: ${value}` }
    }
    return { ok: true }
  }

  if (element.source === "literal") {
    const expected = slugify(element.literal ?? "")
    if (slugify(raw) !== expected && raw !== element.literal) {
      return { ok: false, message: `Literal mismatch for ${element.key}` }
    }
    return { ok: true }
  }

  // Composite names contain separators — skip single-token slug check
  if (
    element.source === "plan" &&
    (element.key === "campaign_name" || element.key === "io_name")
  ) {
    return { ok: true }
  }

  const slug = slugify(raw)
  if (!slug) {
    return { ok: false, message: `Value for ${element.key} slugifies to empty` }
  }
  if (slug.includes("-")) {
    return {
      ok: false,
      message: `Value for ${element.key} contains separator`,
    }
  }

  // Reject if slugification changed meaning too much? Spec: slug rules —
  // value after slug should be usable. Also reject raw containing separator.
  if (raw.includes("-") && element.key !== "campaign_name" && element.key !== "io_name") {
    return {
      ok: false,
      message: `Value for ${element.key} contains separator`,
    }
  }

  if (element.source === "picklist") {
    const list = element.picklist ? PICKLISTS[element.picklist] : undefined
    if (!list) {
      return { ok: false, message: `Unknown picklist ${element.picklist}` }
    }
    const candidate = slug
    if (!list.includes(candidate) && !list.includes(raw.toLowerCase())) {
      return {
        ok: false,
        message: `Value "${value}" not in picklist ${element.picklist}`,
      }
    }
  }

  return { ok: true }
}
