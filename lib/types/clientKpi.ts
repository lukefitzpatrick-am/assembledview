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

// For creating/updating — omit server-generated fields
export type ClientKpiInput = Omit<ClientKpi, 'id' | 'created_at'>

export const MEDIA_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'television', label: 'Television' },
  { value: 'radio', label: 'Radio' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'magazines', label: 'Magazines' },
  { value: 'ooh', label: 'OOH' },
  { value: 'cinema', label: 'Cinema' },
  { value: 'digitalDisplay', label: 'Digital Display' },
  { value: 'digitalAudio', label: 'Digital Audio' },
  { value: 'digitalVideo', label: 'Digital Video' },
  { value: 'bvod', label: 'BVOD' },
  { value: 'integration', label: 'Integration' },
  { value: 'search', label: 'Search' },
  { value: 'socialMedia', label: 'Social Media' },
  { value: 'progDisplay', label: 'Programmatic Display' },
  { value: 'progVideo', label: 'Programmatic Video' },
  { value: 'progBvod', label: 'Programmatic BVOD' },
  { value: 'progAudio', label: 'Programmatic Audio' },
  { value: 'progOoh', label: 'Programmatic OOH' },
  { value: 'influencers', label: 'Influencers' },
  { value: 'production', label: 'Production' },
]

export const BID_STRATEGY_OPTIONS_BY_MEDIA_TYPE: Record<
  string,
  Array<{ value: string; label: string }>
> = {
  television: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'cpm', label: 'CPM' },
    { value: 'cpt', label: 'CPT' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
    { value: 'package', label: 'Package' },
    { value: 'spots', label: 'Spots' },
  ],
  radio: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpm', label: 'CPM' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
    { value: 'package', label: 'Package' },
    { value: 'spots', label: 'Spots' },
  ],
  newspaper: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpm', label: 'CPM' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
    { value: 'insertions', label: 'Insertions' },
    { value: 'package', label: 'Package' },
  ],
  magazines: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpm', label: 'CPM' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
    { value: 'insertions', label: 'Insertions' },
    { value: 'package', label: 'Package' },
  ],
  ooh: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpm', label: 'CPM' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
    { value: 'package', label: 'Package' },
    { value: 'panels', label: 'Panels' },
  ],
  cinema: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpm', label: 'CPM' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
    { value: 'package', label: 'Package' },
    { value: 'spots', label: 'Spots' },
  ],
  digitalDisplay: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpc', label: 'CPC' },
    { value: 'cpm', label: 'CPM' },
    { value: 'cpv', label: 'CPV' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
  ],
  digitalAudio: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpc', label: 'CPC' },
    { value: 'cpm', label: 'CPM' },
    { value: 'cpv', label: 'CPV' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
  ],
  digitalVideo: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpc', label: 'CPC' },
    { value: 'cpm', label: 'CPM' },
    { value: 'cpv', label: 'CPV' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
  ],
  bvod: [
    { value: 'bonus', label: 'Bonus' },
    { value: 'package_inclusions', label: 'Package Inclusions' },
    { value: 'cpc', label: 'CPC' },
    { value: 'cpm', label: 'CPM' },
    { value: 'cpv', label: 'CPV' },
    { value: 'fixed_cost', label: 'Fixed Cost' },
  ],
  search: [
    { value: 'manual_cpc', label: 'Manual CPC' },
    { value: 'maximize_conversions', label: 'Maximise Conversions' },
    { value: 'target_cpa', label: 'Target CPA' },
    { value: 'target_roas', label: 'Target ROAS' },
  ],
  socialMedia: [
    { value: 'manual_cpc', label: 'Clicks' },
    { value: 'completed_views', label: 'Video Views' },
    { value: 'conversion_value', label: 'Conversion Value' },
    { value: 'landing_page_views', label: 'Landing Page Views' },
    { value: 'leads', label: 'Leads' },
    { value: 'maximize_conversions', label: 'Maximize Conversions' },
    { value: 'reach', label: 'Reach' },
  ],
  progDisplay: [
    { value: 'clicks', label: 'Clicks' },
    { value: 'conversions', label: 'Conversions' },
    { value: 'reach', label: 'Reach' },
    { value: 'viewability', label: 'Viewability' },
  ],
  progVideo: [
    { value: 'completed_views', label: 'Completed Views' },
    { value: 'reach', label: 'Reach' },
    { value: 'target_cpa', label: 'Target CPA' },
    { value: 'viewability', label: 'Viewability' },
  ],
  progBvod: [
    { value: 'completed_views', label: 'Completed Views' },
    { value: 'reach', label: 'Reach' },
    { value: 'target_cpa', label: 'Target CPA' },
    { value: 'viewability', label: 'Viewability' },
  ],
  progAudio: [
    { value: 'clicks', label: 'Clicks' },
    { value: 'completed_listens', label: 'Completed Listens' },
    { value: 'conversions', label: 'Conversions' },
    { value: 'reach', label: 'Reach' },
  ],
  progOoh: [
    { value: 'clicks', label: 'Clicks' },
    { value: 'conversions', label: 'Conversions' },
    { value: 'reach', label: 'Reach' },
    { value: 'viewability', label: 'Viewability' },
  ],
  integration: [
    { value: 'fixed_cost', label: 'Fixed Cost' },
    { value: 'package', label: 'Package' },
  ],
  influencers: [
    { value: 'fixed_cost', label: 'Fixed Cost' },
    { value: 'cpm', label: 'CPM' },
    { value: 'cpv', label: 'CPV' },
  ],
  production: [{ value: 'fixed_cost', label: 'Fixed Cost' }],
}

export function getBidStrategiesForMediaType(
  mediaType: string
): Array<{ value: string; label: string }> {
  return BID_STRATEGY_OPTIONS_BY_MEDIA_TYPE[mediaType] ?? []
}

export const CLIENT_KPI_METRIC_FIELDS = [
  'ctr',
  'cpv',
  'conversion_rate',
  'vtr',
  'frequency',
] as const

export const CLIENT_KPI_METRIC_LABELS: Record<string, string> = {
  ctr: 'CTR',
  cpv: 'CPV',
  conversion_rate: 'Conv. Rate',
  vtr: 'VTR',
  frequency: 'Frequency',
}
