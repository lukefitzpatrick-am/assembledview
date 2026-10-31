/**
 * /admin/features view model (pure). Rows grouped by area, with where each
 * value comes from and whether this user may toggle it.
 */
import {
  canToggleFeature,
  FEATURE_DEFINITIONS,
  featureDefinition,
  type FeatureArea,
  type FeatureRow,
  type FeatureSource,
} from "./registry"

export type FeatureStateInput = {
  key: string
  enabled: boolean
  source: FeatureSource
  row: FeatureRow | null
}

export type FeaturePageRow = {
  key: string
  label: string
  description: string
  area: FeatureArea
  enabled: boolean
  source: FeatureSource
  sourceLabel: string
  lastChanged: string | null
  note: string | null
  canToggle: boolean
  /** Why the toggle is disabled, or a dependency hint when it isn't. */
  hint: string | null
}

export type FeaturePageGroup = { area: FeatureArea; label: string; rows: FeaturePageRow[] }

export const FEATURE_AREA_LABELS: Record<FeatureArea, string> = {
  finance: "Finance",
  planning: "Planning",
  reporting: "Reporting",
  clients: "Clients",
  platform: "Platform",
}

const AREA_ORDER: FeatureArea[] = ["finance", "planning", "reporting", "clients", "platform"]

export function featureSourceLabel(source: FeatureSource, envName: string | undefined): string {
  switch (source) {
    case "switch":
      return "Switch"
    case "env":
      return envName ? `Env var ${envName}` : "Default"
    case "default":
      return "Default"
    case "vercel":
      return "Set in Vercel"
  }
}

function lastChanged(row: FeatureRow | null): string | null {
  if (!row?.updatedAt) return null
  const who = row.updatedByName?.trim()
  return who ? `${row.updatedAt.slice(0, 16).replace("T", " ")} by ${who}` : row.updatedAt.slice(0, 16).replace("T", " ")
}

export function buildFeaturePageModel(args: {
  ready: boolean
  states: readonly FeatureStateInput[]
  roles: { admin: boolean; financeAdmin: boolean }
}): FeaturePageGroup[] {
  const byKey = new Map(args.states.map((s) => [s.key, s]))
  const rows: FeaturePageRow[] = FEATURE_DEFINITIONS.map((def) => {
    const s = byKey.get(def.key)
    const enabled = s?.enabled ?? def.defaultOn
    const source = s?.source ?? (def.source === "vercel" ? "vercel" : "default")
    const allowed = canToggleFeature(def, args.roles)
    let hint: string | null = null
    if (def.source === "vercel") hint = def.vercelReason ?? "Set in Vercel."
    else if (!args.ready) hint = "Run SQL 0111 to switch from the page. Until then it reads its env var."
    else if (!allowed) hint = def.toggleRole === "finance_admin" ? "Finance admins only." : "Admins only."
    else if ("requires" in def && def.requires?.length) {
      const off = def.requires.filter((k) => byKey.get(k)?.enabled !== true)
      if (off.length) hint = `Also needs ${off.map((k) => featureDefinition(k)?.label ?? k).join(" and ")} on.`
    }
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      area: def.area,
      enabled,
      source,
      sourceLabel: featureSourceLabel(source, "envName" in def ? def.envName : undefined),
      lastChanged: lastChanged(s?.row ?? null),
      note: s?.row?.note ?? null,
      canToggle: args.ready && allowed && def.source !== "vercel",
      hint,
    }
  })
  return AREA_ORDER.map((area) => ({
    area,
    label: FEATURE_AREA_LABELS[area],
    rows: rows.filter((r) => r.area === area),
  })).filter((g) => g.rows.length > 0)
}
