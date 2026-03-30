/** Default KPI columns on Xano publishers (digital / social / programmatic families). */
export interface PublisherKpiDefaults {
  digitaldisplay_cpm_default?: number
  digitaldisplay_cpc_default?: number
  digitaldisplay_cpv_default?: number
  digitaldisplay_ctr_default?: number
  digitaldisplay_vtr_default?: number
  digitaldisplay_frequency_default?: number
  digitalvideo_cpm_default?: number
  digitalvideo_cpc_default?: number
  digitalvideo_cpv_default?: number
  digitalvideo_ctr_default?: number
  digitalvideo_vtr_default?: number
  digitalvideo_frequency_default?: number
  digitalaudio_cpm_default?: number
  digitalaudio_cpc_default?: number
  digitalaudio_cpv_default?: number
  digitalaudio_ctr_default?: number
  digitalaudio_vtr_default?: number
  digitalaudio_frequency_default?: number
  bvod_cpm_default?: number
  bvod_cpc_default?: number
  bvod_cpv_default?: number
  bvod_ctr_default?: number
  bvod_vtr_default?: number
  bvod_frequency_default?: number
  search_cpm_default?: number
  search_cpc_default?: number
  search_cpv_default?: number
  search_ctr_default?: number
  search_vtr_default?: number
  search_frequency_default?: number
  socialmedia_cpm_default?: number
  socialmedia_cpc_default?: number
  socialmedia_cpv_default?: number
  socialmedia_ctr_default?: number
  socialmedia_vtr_default?: number
  socialmedia_frequency_default?: number
  progdisplay_cpm_default?: number
  progdisplay_cpc_default?: number
  progdisplay_cpv_default?: number
  progdisplay_ctr_default?: number
  progdisplay_vtr_default?: number
  progdisplay_frequency_default?: number
  progvideo_cpm_default?: number
  progvideo_cpc_default?: number
  progvideo_cpv_default?: number
  progvideo_ctr_default?: number
  progvideo_vtr_default?: number
  progvideo_frequency_default?: number
  progbvod_cpm_default?: number
  progbvod_cpc_default?: number
  progbvod_cpv_default?: number
  progbvod_ctr_default?: number
  progbvod_vtr_default?: number
  progbvod_frequency_default?: number
  progaudio_cpm_default?: number
  progaudio_cpc_default?: number
  progaudio_cpv_default?: number
  progaudio_ctr_default?: number
  progaudio_vtr_default?: number
  progaudio_frequency_default?: number
}

export type PublisherKpiFieldKey = keyof PublisherKpiDefaults

/** Xano publishers table shape (extended with default KPI columns). */
export interface Publisher extends PublisherKpiDefaults {
  id: number
  created_at?: number
  publisher_name: string
  publisherid: string
  publishertype: "direct" | "internal_biddable"
  billingagency: "assembled media" | "advertising associates"
  financecode: string
  /** Optional brand colour from Xano (hex string, e.g. "#4F8FCB"). */
  publisher_colour?: string | null
  pub_television: boolean
  pub_radio: boolean
  pub_newspaper: boolean
  pub_magazines: boolean
  pub_ooh: boolean
  pub_cinema: boolean
  pub_digidisplay: boolean
  pub_digiaudio: boolean
  pub_digivideo: boolean
  pub_bvod: boolean
  pub_integration: boolean
  pub_search: boolean
  pub_socialmedia: boolean
  pub_progdisplay: boolean
  pub_progvideo: boolean
  pub_progbvod: boolean
  pub_progaudio: boolean
  pub_progooh: boolean
  pub_influencers: boolean
  radio_comms?: number
  newspaper_comms?: number
  television_comms?: number
  magazines_comms?: number
  ooh_comms?: number
  cinema_comms?: number
  digidisplay_comms?: number
  digiaudio_comms?: number
  digivideo_comms?: number
  bvod_comms?: number
  integration_comms?: number
  search_comms?: number
  socialmedia_comms?: number
  progdisplay_comms?: number
  progvideo_comms?: number
  progbvod_comms?: number
  progaudio_comms?: number
  progooh_comms?: number
  influencers_comms?: number
  /** Legacy Xano naming */
  pub_radio_comms?: number
  pub_newspaper_comms?: number
  pub_television_comms?: number
  pub_magazines_comms?: number
  pub_ooh_comms?: number
  pub_cinema_comms?: number
  pub_digidisplay_comms?: number
  pub_digiaudio_comms?: number
  pub_digivideo_comms?: number
  pub_bvod_comms?: number
  pub_integration_comms?: number
  pub_search_comms?: number
  pub_socialmedia_comms?: number
  pub_progdisplay_comms?: number
  pub_progvideo_comms?: number
  pub_progbvod_comms?: number
  pub_progaudio_comms?: number
  pub_progooh_comms?: number
  pub_influencers_comms?: number
}

export interface PublisherCampaignRow {
  mbaNumber: string
  clientName: string
  campaignName: string
  startDate: string
  endDate: string
  publisherSpendFy: number
  mediaTypes: string[]
  /** Derived from matching line items in the delivery/billing schedule (FY). */
  fixedCostMedia: "Yes" | "No"
  /** Unique targeting-related strings from those line items, joined for display/CSV. */
  targetingDetails: string
}

export interface PublisherDashboardData {
  campaigns: PublisherCampaignRow[]
  monthlySpend: Array<{
    month: string
    data: Array<{ mediaType: string; amount: number }>
  }>
  spendByClient: Array<{
    clientName: string
    amount: number
    percentage: number
  }>
}
