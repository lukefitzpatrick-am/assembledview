/**
 * /admin/features view model (pure). Rows grouped by area, with where each
 * value comes from and whether this user may toggle it.
 */
import { getMelbourneTodayISO, shiftISODate } from "@/lib/dates/melbourne"

import {
  canToggleFeature,
  effectiveFeatureOn,
  FEATURE_DEFINITIONS,
  featureDefinition,
  featureToggleRefusal,
  RETIRE_AFTER_ON_DAYS,
  type FeatureArea,
  type FeatureRow,
  type FeatureSource,
} from "./registry"

export type FeatureStateInput = {
  key: string
  enabled: boolean
  source: FeatureSource
  row: FeatureRow | null
  /** ISO instant the switch was turned on (`readFeatureStates`). */
  onSince?: string | null
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
  owner: string
  /** Melbourne date the switch was turned on, while it is on. */
  onSince: string | null
  /** Melbourne date its retirement falls due (on since plus `retireAfterOn` days). */
  retireAfter: string | null
  /** Past `retireAfter`: the next batch should retire it once Luke confirms (S16). */
  pastRetirement: boolean
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
  /** Melbourne today, YYYY-MM-DD. */
  today?: string
}): FeaturePageGroup[] {
  const today = args.today ?? getMelbourneTodayISO()
  const byKey = new Map(args.states.map((s) => [s.key, s]))
  const raw = (key: string) => byKey.get(key)?.enabled ?? featureDefinition(key)?.defaultOn ?? false
  const live = (key: string) => effectiveFeatureOn(key, raw)
  const rows: FeaturePageRow[] = FEATURE_DEFINITIONS.map((def) => {
    const s = byKey.get(def.key)
    const enabled = s?.enabled ?? def.defaultOn
    const source = s?.source ?? (def.source === "vercel" ? "vercel" : "default")
    const allowed = canToggleFeature(def, args.roles)
    // S16: the same rule setFeatureSwitch enforces, so the page never offers a refused change.
    const refusal = featureToggleRefusal(def.key, !enabled, raw, live)
    let hint: string | null = null
    if (def.source === "vercel") hint = def.vercelReason ?? "Set in Vercel."
    else if (!args.ready) hint = "Run SQL 0111 to switch from the page. Until then it reads its env var."
    else if (!allowed) hint = def.toggleRole === "finance_admin" ? "Finance admins only." : "Admins only."
    else if (refusal) hint = refusal
    else if ("requires" in def && def.requires?.length) {
      const off = def.requires.filter((k) => !live(k))
      if (off.length) hint = `Also needs ${off.map((k) => featureDefinition(k)?.label ?? k).join(" and ")} on.`
    }
    const onAt = s?.onSince ? new Date(s.onSince) : null
    const onSince = onAt && Number.isFinite(onAt.getTime()) ? getMelbourneTodayISO(onAt) : null
    const retireAfter = onSince ? shiftISODate(onSince, featureDefinition(def.key)?.retireAfterOn ?? RETIRE_AFTER_ON_DAYS) : null
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
      canToggle: args.ready && allowed && def.source !== "vercel" && refusal == null,
      hint,
      owner: def.owner,
      onSince,
      retireAfter,
      pastRetirement: retireAfter != null && today > retireAfter,
    }
  })
  return AREA_ORDER.map((area) => ({
    area,
    label: FEATURE_AREA_LABELS[area],
    rows: rows.filter((r) => r.area === area),
  })).filter((g) => g.rows.length > 0)
}
