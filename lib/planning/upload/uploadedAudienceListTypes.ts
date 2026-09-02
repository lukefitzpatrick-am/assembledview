export type UploadedAudienceListRow = {
  id: number
  name: string
  clients_id: number | null
  wave_code: string | null
  filter_label: string | null
  unweighted_n: number | null
  audience_wc: number | null
  file_name?: string | null
  byte_size?: number | null
  segment_key: string
  definition_json: unknown
  created_at: string
}
