import type { PlanningAgeBand, PlanningState } from "../types"

export type UploadedDefinition = {
  states: PlanningState[]
  ageBands: PlanningAgeBand[]
  gender: "all" | "male" | "female"
}

const STATES = new Set<PlanningState>([
  "NAT",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "WA",
  "TAS",
  "NT",
])

const GENDERS = new Set(["all", "male", "female"])

function asStates(value: unknown): PlanningState[] | null {
  if (!Array.isArray(value)) return null
  const out: PlanningState[] = []
  for (const v of value) {
    if (typeof v === "string" && STATES.has(v as PlanningState)) {
      out.push(v as PlanningState)
    }
  }
  return out.length > 0 ? out : null
}

function asAgeBands(value: unknown): PlanningAgeBand[] | null {
  if (!Array.isArray(value)) return null
  const out: PlanningAgeBand[] = []
  for (const v of value) {
    if (typeof v === "string" && v.trim()) out.push(v as PlanningAgeBand)
  }
  return out.length > 0 ? out : null
}

export function parseUploadedDefinition(json: unknown): UploadedDefinition | null {
  if (json == null || typeof json !== "object" || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  const states = asStates(o.states)
  const ageBands = asAgeBands(o.ageBands)
  const genderRaw = o.gender
  const gender =
    typeof genderRaw === "string" && GENDERS.has(genderRaw)
      ? (genderRaw as UploadedDefinition["gender"])
      : "all"
  if (!states || !ageBands) return null
  return { states, ageBands, gender }
}
