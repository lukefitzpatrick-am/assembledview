/**
 * Feature switches (0111). One registry for every on/off feature switch.
 *
 * Rule (Luke, 30 Oct 2026): a new feature adds an entry here, never a new
 * env var. Env vars are only for real secrets and config values.
 *
 * Each switch reads, in order:
 *   1. its feature_switches row (set on /admin/features), once 0111 is applied
 *   2. its old env var, so nothing changes on deploy before anyone toggles
 *   3. its default (off)
 * `source: "vercel"` switches stay env only: they are read in middleware,
 * which cannot query the database. The page shows them as "Set in Vercel".
 *
 * This module is pure (no server-only), so client code can import the keys
 * and labels. Server reads live in lib/features/server.ts.
 */

export type FeatureArea = "finance" | "reporting" | "planning" | "clients" | "platform"

export type FeatureToggleRole = "admin" | "finance_admin"

export type FeatureEnvParse =
  /** on, 1 or true, any case, trimmed */
  | "on_1_true"
  /** exactly "true" after trim */
  | "exact_true"
  /** exactly "true", untrimmed (AUTO_REPORTS_ENABLED) */
  | "exact_true_raw"
  /** "on", any case, trimmed */
  | "on_only"
  /** exactly "1" */
  | "exact_1"

export type FeatureDefinition = {
  key: string
  label: string
  description: string
  area: FeatureArea
  defaultOn: boolean
  /**
   * Server env var read when no switch row exists. Only switches that moved
   * off an env var on 30 Oct have one; new switches leave both out and fall
   * back to `defaultOn`.
   */
  envName?: string
  envParse?: FeatureEnvParse
  /** Sent to the browser in the root layout (client components read it there). */
  clientVisible: boolean
  toggleRole: FeatureToggleRole
  /** "switch": set on /admin/features. "vercel": env only (middleware). */
  source: "switch" | "vercel"
  /** Also needs these switches on (checked by the feature's own getter). */
  requires?: readonly string[]
  /** Why a "vercel" switch can't move to the page. */
  vercelReason?: string
}

export const FEATURE_DEFINITIONS = [
  {
    key: "true_up",
    label: "True-up report",
    description:
      "Finance > Reports > True-up: invoiced vs billing schedule by component and month, and the True-up link on Plan reconciliation.",
    area: "finance",
    defaultOn: false,
    envName: "TRUE_UP",
    envParse: "on_1_true",
    clientVisible: true,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "true_up_actions",
    label: "True-up fixes",
    description:
      "Fixes on the true-up page: carry or spread into the billing schedule, mark explained, one-offs, credit-note flags, invoice links and billing timing. Needs the true-up report on and migration 0109.",
    area: "finance",
    defaultOn: false,
    envName: "TRUE_UP_ACTIONS",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
    requires: ["true_up"],
  },
  {
    key: "true_up_cron",
    label: "Monthly true-up run",
    description: "Runs the true-up at 7 am Sydney on the 2nd, saves the run and emails the summary. Needs the true-up report on.",
    area: "finance",
    defaultOn: false,
    envName: "TRUE_UP_CRON",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
    requires: ["true_up"],
  },
  {
    key: "xero_credit_notes",
    label: "Xero credit notes sync",
    description: "The nightly Xero sync also reads sales credit notes and stores them as negative invoices. Turn off if the sync starts failing.",
    area: "finance",
    defaultOn: false,
    envName: "XERO_SYNC_CREDIT_NOTES",
    envParse: "exact_true",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "billing_revisions",
    label: "Billing revisions",
    description: "The billing revisions panel on media plans (bill ahead, move timing, undo), its routes and Ava's billing revision tools.",
    area: "finance",
    defaultOn: false,
    envName: "BILLING_REVISIONS",
    envParse: "on_1_true",
    clientVisible: true,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "fee_snapshot_write_once",
    label: "Fee snapshot write-once",
    description: "Each published version keeps its first fee snapshot. Off: every publish overwrites it.",
    area: "finance",
    defaultOn: false,
    envName: "FEE_SNAPSHOT_WRITE_ONCE",
    envParse: "on_only",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "client_invoices",
    label: "Invoices for clients",
    description: "Clients see their Xero invoices (paid, due, overdue) and PDFs on their dashboard. Admins see them either way.",
    area: "finance",
    defaultOn: false,
    envName: "CLIENT_INVOICES_ENABLED",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "overdue_digest",
    label: "Overdue invoice digest",
    description: "A weekday email to ops listing overdue Xero invoices.",
    area: "finance",
    defaultOn: false,
    envName: "OVERDUE_DIGEST_ENABLED",
    envParse: "exact_true_raw",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "billing_balancer",
    label: "Billing balancer",
    description: "Manual billing edits keep the line total by moving the difference into a balancer month.",
    area: "planning",
    defaultOn: false,
    envName: "NEXT_PUBLIC_BILLING_BALANCER",
    envParse: "on_1_true",
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "plan_drafts",
    label: "Plan autosave drafts",
    description: "Autosave in the media plan editor (browser every 3 seconds, server every 15) and the Save draft button.",
    area: "planning",
    defaultOn: false,
    envName: "NEXT_PUBLIC_PLAN_DRAFTS",
    envParse: "on_1_true",
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "web_search",
    label: "Web & search for clients",
    description: "Clients see their Web & search tab once their report is published. Admins see it either way.",
    area: "reporting",
    defaultOn: false,
    envName: "FEATURE_WEB_SEARCH",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "creative_performance",
    label: "Creative performance",
    description: "The Top 3 strip and ads inside each delivery line on campaign dashboards, and creatives in report decks. Off is hidden for everyone.",
    area: "reporting",
    defaultOn: false,
    envName: "FEATURE_CREATIVE_PERFORMANCE",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "auto_reports",
    label: "Monthly auto reports",
    description: "The 4th and 5th of the month crons queue and build one report deck per live MBA.",
    area: "reporting",
    defaultOn: false,
    envName: "AUTO_REPORTS_ENABLED",
    envParse: "exact_true_raw",
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "platform_accounts_web",
    label: "GA4 and Search Console accounts",
    description: "Offers GA4 and Search Console in a client's Platform accounts.",
    area: "clients",
    defaultOn: false,
    envName: "NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB",
    envParse: "exact_1",
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "codex_v2",
    label: "Tasks (Codex)",
    description: "The Postgres Codex task module at /tasks, its API and the recurring task run.",
    area: "platform",
    defaultOn: false,
    envName: "CODEX_V2",
    envParse: "on_only",
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "unmapped_delivery",
    label: "Unmapped delivery",
    description:
      "Pacing > Relabels > Unmapped lists the last 30 days of platform delivery (Meta, TikTok, Reddit, Google, Microsoft, programmatic, CM360) that attaches to no published line, with what to do about each. Admins only. Off: the tab shows CM360 placements only.",
    area: "planning",
    defaultOn: true,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "view_as",
    label: "View as client",
    description: "Admins can view the app as a client (read only, audited). Also needs a signing secret.",
    area: "platform",
    defaultOn: false,
    envName: "VIEW_AS_ENABLED",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "admin",
    source: "vercel",
    vercelReason: "Read in middleware on every request, which can't query the database. Change it in Vercel.",
  },
] as const satisfies readonly FeatureDefinition[]

export type FeatureKey = (typeof FEATURE_DEFINITIONS)[number]["key"]

export type ClientFeatureKey = Extract<(typeof FEATURE_DEFINITIONS)[number], { clientVisible: true }>["key"]

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURE_DEFINITIONS.map((d) => d.key)

export const CLIENT_FEATURE_KEYS = FEATURE_DEFINITIONS.filter((d) => d.clientVisible).map((d) => d.key) as ClientFeatureKey[]

const BY_KEY = new Map<string, FeatureDefinition>(FEATURE_DEFINITIONS.map((d) => [d.key, d]))

export function featureDefinition(key: string): FeatureDefinition | undefined {
  return BY_KEY.get(key)
}

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && BY_KEY.has(value)
}

/** Parses an env value exactly as the feature read it before 0111. */
export function parseFeatureEnv(raw: string | undefined, parse: FeatureEnvParse): boolean {
  switch (parse) {
    case "on_1_true": {
      const v = String(raw ?? "").trim().toLowerCase()
      return v === "on" || v === "1" || v === "true"
    }
    case "exact_true":
      return String(raw ?? "").trim() === "true"
    case "exact_true_raw":
      return raw === "true"
    case "on_only":
      return String(raw ?? "").trim().toLowerCase() === "on"
    case "exact_1":
      return raw === "1"
  }
}

export type FeatureSource = "switch" | "env" | "default" | "vercel"

export type FeatureRow = {
  key: string
  enabled: boolean
  updatedAt: string | null
  updatedBy: number | null
  updatedByName: string | null
  note: string | null
}

/**
 * Pure resolution. `rows` is null when the table can't be read (0111 not
 * applied or the database errored): every switch then falls back to env.
 */
export function resolveFeature(
  def: FeatureDefinition,
  rows: ReadonlyMap<string, FeatureRow> | null,
  env: Record<string, string | undefined>,
): { enabled: boolean; source: FeatureSource } {
  if (def.source === "vercel") {
    const raw = def.envName ? env[def.envName] : undefined
    return { enabled: def.envParse ? parseFeatureEnv(raw, def.envParse) : def.defaultOn, source: "vercel" }
  }
  const row = rows?.get(def.key)
  if (row) return { enabled: row.enabled, source: "switch" }
  const raw = def.envName ? env[def.envName] : undefined
  if (def.envParse && raw !== undefined && String(raw).trim() !== "") {
    return { enabled: parseFeatureEnv(raw, def.envParse), source: "env" }
  }
  return { enabled: def.defaultOn, source: "default" }
}

/** Who may toggle: admin roles, or finance admin for finance switches. */
export function canToggleFeature(def: FeatureDefinition, roles: { admin: boolean; financeAdmin: boolean }): boolean {
  if (def.source === "vercel") return false
  return def.toggleRole === "finance_admin" ? roles.financeAdmin : roles.admin
}

/**
 * Env-only value (no database). For pure sync helpers whose callers pass the
 * live value in, and as their default in tests. Not for live gates.
 */
export function featureEnvValue(key: FeatureKey, env: Record<string, string | undefined> = process.env): boolean {
  const def = featureDefinition(key)
  if (!def) return false
  return resolveFeature(def, null, env).enabled
}
