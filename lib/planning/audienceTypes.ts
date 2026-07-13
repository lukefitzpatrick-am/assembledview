/** Shared DTOs for Xano planning_audiences (client + server). */

export type PlanningAudienceRow = {
  id: number
  created_at?: number | string
  clients_id: number
  mba_number?: string | null
  name: string
  definition_json: unknown
  composed_wc: number
  client_visible: boolean
  created_by_email: string
}

export type PlanningAudienceWritable = {
  clients_id: number
  mba_number?: string | null
  name: string
  definition_json: unknown
  composed_wc: number
  client_visible?: boolean
  created_by_email: string
}

/** Whitelisted PATCH fields only (staff attach / visibility / rename). */
export type PlanningAudiencePatch = {
  mba_number?: string | null
  client_visible?: boolean
  name?: string
}

/** Client-safe channel point for the reach × index chart (no BCS/cost/bench). */
export type ClientSafeReachIndexPoint = {
  channel: string
  reach_pct: number
  affinity_index: number
}

/** Whitelist-shaped payload for GET /api/planning/audiences/by-mba. */
export type ClientSafePlannedAudience = {
  id: number
  name: string
  composed_wc: number
  client_visible: boolean
  created_at: string | null
  wave_label: string
  definition_summary: {
    segment_name: string
    states: string[]
    age_bands: string[]
    gender: string
    reach_basis: string
  }
  definition_line: string
  reach_index: ClientSafeReachIndexPoint[]
}
