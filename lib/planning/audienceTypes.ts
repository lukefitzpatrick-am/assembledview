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
