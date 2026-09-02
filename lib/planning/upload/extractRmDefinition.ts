import { PLANNING_AGE_BANDS, type PlanningAgeBand, type PlanningState } from "../types"
import { normaliseRmLabel } from "./royMorganAliases"
import type { RmBlock, RmDataRow } from "./royMorganTypes"

const STATE_LABELS: Record<string, PlanningState> = {
  "n.s.w. incl. act": "NSW",
  "nsw incl. act": "NSW",
  "n.s.w.": "NSW",
  nsw: "NSW",
  victoria: "VIC",
  vic: "VIC",
  queensland: "QLD",
  qld: "QLD",
  "south australia": "SA",
  sa: "SA",
  "western australia": "WA",
  wa: "WA",
  tasmania: "TAS",
  tas: "TAS",
  "darwin - alice springs": "NT",
  "darwin-alice springs": "NT",
  "northern territory": "NT",
  nt: "NT",
}

const ALL_STATES: PlanningState[] = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"]

function sectionRows(block: RmBlock, re: RegExp): RmDataRow[] {
  return block.rows.filter((r) => r.section != null && re.test(r.section.trim()))
}

function mapState(label: string): PlanningState | null {
  return STATE_LABELS[normaliseRmLabel(label)] ?? null
}

function mapAgeBand(label: string): PlanningAgeBand | null {
  const s = normaliseRmLabel(label)
  if (/14\s*[–-]\s*17/.test(s) || /18\s*[–-]\s*24/.test(s) || /14\s*[–-]\s*24/.test(s)) {
    return "14-24"
  }
  if (/25\s*[–-]\s*34/.test(s)) return "25-34"
  if (
    /35\s*[–-]\s*44/.test(s) ||
    /45\s*[–-]\s*49/.test(s) ||
    /35\s*[–-]\s*49/.test(s)
  ) {
    return "35-49"
  }
  if (
    /50\s*[–-]\s*54/.test(s) ||
    /55\s*[–-]\s*64/.test(s) ||
    /50\s*[–-]\s*64/.test(s)
  ) {
    return "50-64"
  }
  if (/65\s*\+/.test(s) || /65\s*[–-]/.test(s) || /70\s*\+/.test(s)) return "65+"
  return null
}

export function extractRmDefinition(block: RmBlock): {
  states: PlanningState[]
  ageBands: PlanningAgeBand[]
  gender: "all" | "male" | "female"
  confident: boolean
} {
  let confident = true

  const stateRows = sectionRows(block, /^states$/i)
  const mappedStates: { state: PlanningState; reachPct: number | null }[] = []
  const seen = new Set<PlanningState>()
  for (const row of stateRows) {
    const st = mapState(row.label)
    if (!st || seen.has(st)) continue
    seen.add(st)
    mappedStates.push({ state: st, reachPct: row.reachPct })
  }

  let states: PlanningState[]
  const single = mappedStates.filter((s) => (s.reachPct ?? 0) >= 0.98)
  const allNonNull =
    mappedStates.length > 0 &&
    ALL_STATES.every((st) => mappedStates.some((s) => s.state === st && s.reachPct != null))

  if (single.length === 1 && mappedStates.length >= 1) {
    states = [single[0]!.state]
  } else if (allNonNull) {
    states = ["NAT"]
  } else {
    states = ["NAT"]
    if (stateRows.length === 0 || mappedStates.length === 0 || !allNonNull) {
      confident = false
    }
  }

  const sexRows = sectionRows(block, /^sex$/i)
  let gender: "all" | "male" | "female" = "all"
  for (const row of sexRows) {
    const l = normaliseRmLabel(row.label)
    if ((l === "men" || l === "male") && (row.reachPct ?? 0) >= 0.98) gender = "male"
    if ((l === "women" || l === "female") && (row.reachPct ?? 0) >= 0.98) gender = "female"
  }
  if (sexRows.length === 0) confident = false

  const ageRows = sectionRows(block, /^age\b/i)
  const bands = new Set<PlanningAgeBand>()
  for (const row of ageRows) {
    if (row.suppressed || row.reachPct == null) continue
    const band = mapAgeBand(row.label)
    if (band) bands.add(band)
  }
  let ageBands: PlanningAgeBand[]
  if (bands.size === 0) {
    ageBands = [...PLANNING_AGE_BANDS]
    confident = false
  } else {
    ageBands = PLANNING_AGE_BANDS.filter((b) => bands.has(b))
  }

  return { states, ageBands, gender, confident }
}
