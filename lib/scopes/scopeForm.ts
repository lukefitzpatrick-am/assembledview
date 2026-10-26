/**
 * Pure helpers shared by the scope-of-work create and edit pages (FB-8).
 */

/**
 * Coerce a typed cost to a number the same way the cost inputs do on blur:
 * strip everything except digits and dots, then parseFloat. Non-numeric is 0.
 */
export function coerceMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (value == null) return 0
  const n = parseFloat(String(value).replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) ? n : 0
}

type CostRow = { expense_category: string; description: string; cost: unknown }
type BillingRow = { month: string; cost: unknown }

/**
 * Return copies of the cost and billing rows with every `cost` as a number.
 * Inputs hold strings until blur, but the schema expects numbers, so Save
 * runs this before validation.
 */
export function normaliseScopeCostRows<
  C extends CostRow,
  B extends BillingRow,
>(values: { cost: C[]; billing_schedule: B[] }): {
  cost: Array<C & { cost: number }>
  billing_schedule: Array<B & { cost: number }>
} {
  return {
    cost: (values.cost ?? []).map((row) => ({ ...row, cost: coerceMoney(row.cost) })),
    billing_schedule: (values.billing_schedule ?? []).map((row) => ({
      ...row,
      cost: coerceMoney(row.cost),
    })),
  }
}

const FIELD_LABELS: Record<string, string> = {
  client_name: "Client name",
  contact_name: "Contact name",
  contact_email: "Contact email",
  scope_date: "Scope date",
  scope_version: "Scope version",
  project_name: "Project name",
  project_status: "Project status",
  project_overview: "Project overview",
  deliverables: "Deliverables",
  tasks_steps: "Tasks and steps",
  timelines: "Timelines",
  responsibilities: "Responsibilities",
  requirements: "Requirements",
  assumptions: "Assumptions",
  exclusions: "Exclusions",
  payment_terms_and_conditions: "Payment terms",
  scope_id: "Scope ID",
}

const ARRAY_LABELS: Record<string, { group: string; row: string; fields: Record<string, string> }> = {
  cost: {
    group: "Cost lines",
    row: "Cost line",
    fields: { expense_category: "category", description: "description", cost: "amount" },
  },
  billing_schedule: {
    group: "Billing schedule",
    row: "Billing row",
    fields: { month: "month", cost: "amount" },
  },
}

function messageOf(node: unknown): string | null {
  if (!node || typeof node !== "object") return null
  const m = (node as { message?: unknown }).message
  return typeof m === "string" && m.trim() ? m.trim() : null
}

/**
 * Flatten react-hook-form errors into readable field names, for example
 * ["Contact email", "Cost line 2 amount", "Billing schedule: At least one ..."].
 */
export function describeScopeFormErrors(errors: unknown): string[] {
  if (!errors || typeof errors !== "object") return []
  const out: string[] = []
  for (const [key, node] of Object.entries(errors as Record<string, unknown>)) {
    if (!node || typeof node !== "object") continue
    const arr = ARRAY_LABELS[key]
    if (arr) {
      const groupMsg = messageOf(node) ?? messageOf((node as { root?: unknown }).root)
      if (groupMsg) out.push(`${arr.group}: ${groupMsg}`)
      const entries = Array.isArray(node)
        ? node.map((v, i) => [String(i), v] as const)
        : Object.entries(node as Record<string, unknown>).filter(([k]) => /^\d+$/.test(k))
      for (const [idx, rowErr] of entries) {
        if (!rowErr || typeof rowErr !== "object") continue
        for (const fieldKey of Object.keys(rowErr as Record<string, unknown>)) {
          const label = arr.fields[fieldKey] ?? fieldKey
          out.push(`${arr.row} ${Number(idx) + 1} ${label}`)
        }
      }
      continue
    }
    out.push(FIELD_LABELS[key] ?? key)
  }
  return out
}

/** One toast description naming the failing fields. */
export function scopeValidationToastDescription(errors: unknown): string {
  const names = describeScopeFormErrors(errors)
  if (names.length === 0) return "Check the highlighted fields."
  const shown = names.slice(0, 6).join(", ")
  const more = names.length > 6 ? ` and ${names.length - 6} more` : ""
  return `Fix: ${shown}${more}.`
}

/**
 * The scope id is fixed at creation. Saving an existing scope never changes
 * it, even when `scope_version` goes up. Finance status rows are keyed
 * `sow:{scope_id}:{month}`, so a rename would orphan approvals.
 *
 * Only a legacy row with no stored id gets one generated, once.
 */
export function resolveScopeIdForSave(input: {
  storedScopeId: string | null | undefined
  clientMbaIdentifier?: string | null
  scopeVersion?: number | null
}): string {
  const stored = String(input.storedScopeId ?? "").trim()
  if (stored) return stored
  const prefix = String(input.clientMbaIdentifier ?? "").trim()
  if (!prefix) return ""
  const version = Number(input.scopeVersion)
  const n = Number.isFinite(version) && version > 0 ? Math.floor(version) : 1
  return `${prefix}_sow${String(n).padStart(3, "0")}`
}
