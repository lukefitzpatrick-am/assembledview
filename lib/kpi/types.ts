import * as z from "zod"

// --- from types/kpi.ts (canonical KPI domain shapes) ---

export interface PublisherKPI {
  id: number
  created_at: number
  publisher: string
  bid_strategy: string
  ctr: number
  cpv: number
  conversion_rate: number
  vtr: number
  frequency: number
  media_type: string
}

export interface ClientKPI {
  id: number
  created_at: number
  mp_client_name: string
  publisher_name: string
  media_type: string
  bid_strategy: string
  ctr: number
  cpv: number
  conversion_rate: number
  vtr: number
  frequency: number
}

export interface CampaignKPI {
  id?: number
  created_at?: number
  mp_client_name: string
  mba_number: string
  version_number: number
  campaign_name: string
  media_type: string
  publisher: string
  bid_strategy: string
  /** Xano `campaign_kpi.line_item_id` — required on new rows (fan-out from line items). */
  line_item_id?: string
  ctr: number
  cpv: number
  conversion_rate: number
  vtr: number
  frequency: number
}

// UI-only — not persisted to Xano directly
export interface ResolvedKPIRow extends CampaignKPI {
  lineItemId: string
  lineItemLabel: string
  spend: number
  deliverables: number
  buyType: string
  source: "client" | "publisher" | "default" | "manual" | "saved"
  isManuallyEdited: boolean
  calculatedClicks: number
  calculatedViews: number
  calculatedReach: number
}

export type CampaignKpiInput = Omit<CampaignKPI, "id" | "created_at">

// --- from lib/types/clientKpi.ts ---

export interface ClientKpi {
  id: number
  created_at: number
  mp_client_name: string
  publisher_name: string
  media_type: string
  bid_strategy: string
  ctr: number
  cpv: number
  conversion_rate: number
  vtr: number
  frequency: number
}

export type ClientKpiInput = Omit<ClientKpi, "id" | "created_at">

export const MEDIA_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "television", label: "Television" },
  { value: "radio", label: "Radio" },
  { value: "newspaper", label: "Newspaper" },
  { value: "magazines", label: "Magazines" },
  { value: "ooh", label: "OOH" },
  { value: "cinema", label: "Cinema" },
  { value: "digitalDisplay", label: "Digital Display" },
  { value: "digitalAudio", label: "Digital Audio" },
  { value: "digitalVideo", label: "Digital Video" },
  { value: "bvod", label: "BVOD" },
  { value: "integration", label: "Integration" },
  { value: "search", label: "Search" },
  { value: "socialMedia", label: "Social Media" },
  { value: "progDisplay", label: "Programmatic Display" },
  { value: "progVideo", label: "Programmatic Video" },
  { value: "progBvod", label: "Programmatic BVOD" },
  { value: "progAudio", label: "Programmatic Audio" },
  { value: "progOoh", label: "Programmatic OOH" },
  { value: "influencers", label: "Influencers" },
  { value: "production", label: "Production" },
]

export const BID_STRATEGY_OPTIONS_BY_MEDIA_TYPE: Record<
  string,
  Array<{ value: string; label: string }>
> = {
  television: [
    { value: "bonus", label: "Bonus" },
    { value: "cpm", label: "CPM" },
    { value: "cpt", label: "CPT" },
    { value: "fixed_cost", label: "Fixed Cost" },
    { value: "package", label: "Package" },
    { value: "spots", label: "Spots" },
  ],
  radio: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpm", label: "CPM" },
    { value: "fixed_cost", label: "Fixed Cost" },
    { value: "package", label: "Package" },
    { value: "spots", label: "Spots" },
  ],
  newspaper: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpm", label: "CPM" },
    { value: "fixed_cost", label: "Fixed Cost" },
    { value: "insertions", label: "Insertions" },
    { value: "package", label: "Package" },
  ],
  magazines: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpm", label: "CPM" },
    { value: "fixed_cost", label: "Fixed Cost" },
    { value: "insertions", label: "Insertions" },
    { value: "package", label: "Package" },
  ],
  ooh: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpm", label: "CPM" },
    { value: "fixed_cost", label: "Fixed Cost" },
    { value: "package", label: "Package" },
    { value: "panels", label: "Panels" },
  ],
  cinema: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpm", label: "CPM" },
    { value: "fixed_cost", label: "Fixed Cost" },
    { value: "package", label: "Package" },
    { value: "spots", label: "Spots" },
  ],
  digitalDisplay: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpc", label: "CPC" },
    { value: "cpm", label: "CPM" },
    { value: "cpv", label: "CPV" },
    { value: "fixed_cost", label: "Fixed Cost" },
  ],
  digitalAudio: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpc", label: "CPC" },
    { value: "cpm", label: "CPM" },
    { value: "cpv", label: "CPV" },
    { value: "fixed_cost", label: "Fixed Cost" },
  ],
  digitalVideo: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpc", label: "CPC" },
    { value: "cpm", label: "CPM" },
    { value: "cpv", label: "CPV" },
    { value: "fixed_cost", label: "Fixed Cost" },
  ],
  bvod: [
    { value: "bonus", label: "Bonus" },
    { value: "package_inclusions", label: "Package Inclusions" },
    { value: "cpc", label: "CPC" },
    { value: "cpm", label: "CPM" },
    { value: "cpv", label: "CPV" },
    { value: "fixed_cost", label: "Fixed Cost" },
  ],
  search: [
    { value: "manual_cpc", label: "Manual CPC" },
    { value: "maximize_conversions", label: "Maximise Conversions" },
    { value: "target_cpa", label: "Target CPA" },
    { value: "target_roas", label: "Target ROAS" },
  ],
  socialMedia: [
    { value: "manual_cpc", label: "Clicks" },
    { value: "completed_views", label: "Video Views" },
    { value: "conversion_value", label: "Conversion Value" },
    { value: "landing_page_views", label: "Landing Page Views" },
    { value: "leads", label: "Leads" },
    { value: "maximize_conversions", label: "Maximize Conversions" },
    { value: "reach", label: "Reach" },
  ],
  progDisplay: [
    { value: "clicks", label: "Clicks" },
    { value: "conversions", label: "Conversions" },
    { value: "reach", label: "Reach" },
    { value: "viewability", label: "Viewability" },
  ],
  progVideo: [
    { value: "completed_views", label: "Completed Views" },
    { value: "reach", label: "Reach" },
    { value: "target_cpa", label: "Target CPA" },
    { value: "viewability", label: "Viewability" },
  ],
  progBvod: [
    { value: "completed_views", label: "Completed Views" },
    { value: "reach", label: "Reach" },
    { value: "target_cpa", label: "Target CPA" },
    { value: "viewability", label: "Viewability" },
  ],
  progAudio: [
    { value: "clicks", label: "Clicks" },
    { value: "completed_listens", label: "Completed Listens" },
    { value: "conversions", label: "Conversions" },
    { value: "reach", label: "Reach" },
  ],
  progOoh: [
    { value: "clicks", label: "Clicks" },
    { value: "conversions", label: "Conversions" },
    { value: "reach", label: "Reach" },
    { value: "viewability", label: "Viewability" },
  ],
  integration: [
    { value: "fixed_cost", label: "Fixed Cost" },
    { value: "package", label: "Package" },
  ],
  influencers: [
    { value: "fixed_cost", label: "Fixed Cost" },
    { value: "cpm", label: "CPM" },
    { value: "cpv", label: "CPV" },
  ],
  production: [{ value: "fixed_cost", label: "Fixed Cost" }],
}

export function getBidStrategiesForMediaType(
  mediaType: string,
): Array<{ value: string; label: string }> {
  return BID_STRATEGY_OPTIONS_BY_MEDIA_TYPE[mediaType] ?? []
}

export const CLIENT_KPI_METRIC_FIELDS = [
  "ctr",
  "cpv",
  "conversion_rate",
  "vtr",
  "frequency",
] as const

export const CLIENT_KPI_METRIC_LABELS: Record<string, string> = {
  ctr: "CTR",
  cpv: "CPV",
  conversion_rate: "Conv. Rate",
  vtr: "VTR",
  frequency: "Frequency",
}

// --- from lib/types/publisherKpi.ts (Zod + Xano table row) ---

/** Xano `publisher_kpi` table row. */
export interface PublisherKpi {
  id: number
  created_at: number
  publisher: string
  bid_strategy: string
  ctr: number
  cpv: number
  conversion_rate: number
  vtr: number
  frequency: number
  media_type: string
}

export type PublisherKpiInput = Omit<PublisherKpi, "id" | "created_at">

// --- Zod (shared with publisher + campaign + client body schemas) ---

const kpiMetric = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return 0
    const n = typeof v === "number" ? v : Number(String(v).trim())
    return Number.isFinite(n) ? n : 0
  })

const nonEmptyStr = z.string().trim().min(1, "Required")

export const publisherKpiCreateBodySchema = z.object({
  publisher: nonEmptyStr,
  media_type: nonEmptyStr,
  bid_strategy: nonEmptyStr,
  ctr: kpiMetric,
  cpv: kpiMetric,
  conversion_rate: kpiMetric,
  vtr: kpiMetric,
  frequency: kpiMetric,
})

export const publisherKpiPatchBodySchema = z
  .object({
    id: z.coerce.number(),
    publisher: z.string().trim().min(1).optional(),
    media_type: z.string().trim().min(1).optional(),
    bid_strategy: z.string().trim().min(1).optional(),
    ctr: kpiMetric.optional(),
    cpv: kpiMetric.optional(),
    conversion_rate: kpiMetric.optional(),
    vtr: kpiMetric.optional(),
    frequency: kpiMetric.optional(),
  })
  .refine(
    (o) =>
      o.publisher !== undefined ||
      o.media_type !== undefined ||
      o.bid_strategy !== undefined ||
      o.ctr !== undefined ||
      o.cpv !== undefined ||
      o.conversion_rate !== undefined ||
      o.vtr !== undefined ||
      o.frequency !== undefined,
    { message: "At least one field to update is required" },
  )

export type PublisherKpiCreateBody = z.infer<typeof publisherKpiCreateBodySchema>
export type PublisherKpiPatchBody = z.infer<typeof publisherKpiPatchBodySchema>

// --- new: campaign CRUD request bodies ---

const campaignKpiItemSchema = z.object({
  mp_client_name: nonEmptyStr,
  mba_number: nonEmptyStr,
  version_number: z.coerce.number(),
  campaign_name: nonEmptyStr,
  media_type: nonEmptyStr,
  publisher: nonEmptyStr,
  bid_strategy: nonEmptyStr,
  line_item_id: z.string().trim().min(1, "line_item_id is required"),
  ctr: kpiMetric.optional().default(0),
  cpv: kpiMetric.optional().default(0),
  conversion_rate: kpiMetric.optional().default(0),
  vtr: kpiMetric.optional().default(0),
  frequency: kpiMetric.optional().default(0),
})

export const campaignKpiCreateBodySchema = z.array(campaignKpiItemSchema)

export const campaignKpiPatchBodySchema = z.object({
  id: z.coerce.number(),
  mp_client_name: z.string().trim().min(1).optional(),
  mba_number: z.string().trim().min(1).optional(),
  version_number: z.coerce.number().optional(),
  campaign_name: z.string().trim().min(1).optional(),
  media_type: z.string().trim().min(1).optional(),
  publisher: z.string().trim().min(1).optional(),
  bid_strategy: z.string().trim().min(1).optional(),
  ctr: kpiMetric.optional(),
  cpv: kpiMetric.optional(),
  conversion_rate: kpiMetric.optional(),
  vtr: kpiMetric.optional(),
  frequency: kpiMetric.optional(),
})

// --- new: client KPI API request bodies (match prior manual checks) ---

export const clientKpiCreateBodySchema = z.object({
  mp_client_name: nonEmptyStr,
  publisher_name: nonEmptyStr,
  media_type: nonEmptyStr,
  bid_strategy: z.string().optional().default(""),
  ctr: kpiMetric.optional().default(0),
  cpv: kpiMetric.optional().default(0),
  conversion_rate: kpiMetric.optional().default(0),
  vtr: kpiMetric.optional().default(0),
  frequency: kpiMetric.optional().default(0),
})

export const clientKpiPatchBodySchema = z
  .object({ id: z.coerce.number() })
  .merge(
    z.object({
      mp_client_name: z.string().trim().min(1).optional(),
      publisher_name: z.string().trim().min(1).optional(),
      media_type: z.string().trim().min(1).optional(),
      bid_strategy: z.string().optional(),
      ctr: kpiMetric.optional(),
      cpv: kpiMetric.optional(),
      conversion_rate: kpiMetric.optional(),
      vtr: kpiMetric.optional(),
      frequency: kpiMetric.optional(),
    }),
  )
