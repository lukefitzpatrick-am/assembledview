import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const audioSite = pgTable(
  "audio_site",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  platform: text('platform'),
  site: text('site'),
  },
  (table) => [
    index("idx_audio_site_created_at").on(table.createdAt),
  ],
)

export const bvodSite = pgTable(
  "bvod_site",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  platform: text('platform'),
  site: text('site'),
  },
  (table) => [
    index("idx_bvod_site_created_at").on(table.createdAt),
  ],
)

export const campaignKpi = pgTable(
  "campaign_kpi",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  mpClientName: text('mp_client_name'),
  mbaNumber: text('mba_number'),
  versionNumber: bigint('version_number', { mode: "number" }),
  campaignName: text('campaign_name'),
  mediaType: text('media_type'),
  publisher: text('publisher'),
  bidStrategy: text('bid_strategy'),
  ctr: numeric('ctr'),
  cpv: numeric('cpv'),
  conversionRate: numeric('conversion_rate'),
  vtr: numeric('vtr'),
  frequency: numeric('frequency'),
  lineItemId: text('line_item_id'),
  },
  (table) => [
    index("idx_campaign_kpi_created_at").on(table.createdAt),
  ],
)

export const clientKpi = pgTable(
  "client_kpi",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  mpClientName: text('mp_client_name'),
  publisherName: text('publisher_name'),
  mediaType: text('media_type'),
  bidStrategy: text('bid_strategy'),
  ctr: numeric('ctr'),
  cpv: numeric('cpv'),
  conversionRate: numeric('conversion_rate'),
  vtr: numeric('vtr'),
  frequency: numeric('frequency'),
  },
  (table) => [
    index("idx_client_kpi_created_at").on(table.createdAt),
  ],
)

export const clientdashboard = pgTable(
  "clientdashboard",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  clientDashboard: text('client_dashboard'),
  idgoogleadsDashboard: text('idgoogleads_dashboard'),
  idmetaDashboard: text('idmeta_dashboard'),
  idcm360Dashboard: text('idcm360_dashboard'),
  iddv360Dashboard: text('iddv360_dashboard'),
  idtiktokDashboard: text('idtiktok_dashboard'),
  idlinkedinDashboard: text('idlinkedin_dashboard'),
  idpinterestDashboard: text('idpinterest_dashboard'),
  idquantcastDashboard: text('idquantcast_dashboard'),
  idtaboolaDashboard: text('idtaboola_dashboard'),
  idsnapchatDashboard: text('idsnapchat_dashboard'),
  idbingDashboard: text('idbing_dashboard'),
  idvistarDashboard: text('idvistar_dashboard'),
  idga4Dashboard: text('idga4_dashboard'),
  idmerchantcentreDashboard: text('idmerchantcentre_dashboard'),
  idshopifyDashboard: text('idshopify_dashboard'),
  },
)

export const clients = pgTable(
  "clients",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  mpClientName: text('mp_client_name'),
  clientcategory: text('clientcategory'),
  abn: text('abn'),
  mbaidentifier: text('mbaidentifier'),
  legalbusinessname: text('legalbusinessname'),
  streetaddress: text('streetaddress'),
  suburb: text('suburb'),
  stateDropdown: text('state_dropdown'),
  postcode: text('postcode'),
  keyfirstname: text('keyfirstname'),
  keylastname: text('keylastname'),
  keyphone: bigint('keyphone', { mode: "number" }),
  keyemail: text('keyemail'),
  billingfirstname: text('billingfirstname'),
  billinglastname: text('billinglastname'),
  billingphone: bigint('billingphone', { mode: "number" }),
  billingemail: text('billingemail'),
  monthlyretainer: numeric('monthlyretainer'),
  organicsocial: numeric('organicsocial'),
  televisionCheckbox: boolean('television_checkbox'),
  radioCheckbox: boolean('radio_checkbox'),
  newspapersCheckbox: boolean('newspapers_checkbox'),
  magazinesCheckbox: boolean('magazines_checkbox'),
  oohCheckbox: boolean('ooh_checkbox'),
  cinemaCheckbox: boolean('cinema_checkbox'),
  digitaldisplayCheckbox: boolean('digitaldisplay_checkbox'),
  digitalaudioCheckbox: boolean('digitalaudio_checkbox'),
  digitalvideoCheckbox: boolean('digitalvideo_checkbox'),
  bvodCheckbox: boolean('bvod_checkbox'),
  feesocial: numeric('feesocial'),
  feesearch: numeric('feesearch'),
  feeprogdisplay: numeric('feeprogdisplay'),
  feeprogvideo: numeric('feeprogvideo'),
  feeprogbvod: numeric('feeprogbvod'),
  feeprogaudio: numeric('feeprogaudio'),
  feeprogooh: numeric('feeprogooh'),
  feecontentcreator: numeric('feecontentcreator'),
  adservvideo: numeric('adservvideo'),
  adservimp: numeric('adservimp'),
  adservdisplay: numeric('adservdisplay'),
  adservaudio: numeric('adservaudio'),
  idgoogleads: text('idgoogleads'),
  idmeta: text('idmeta'),
  idcm360: text('idcm360'),
  iddv360: text('iddv360'),
  idtiktok: text('idtiktok'),
  idlinkedin: text('idlinkedin'),
  idpinterest: text('idpinterest'),
  idquantcast: text('idquantcast'),
  idtaboola: text('idtaboola'),
  idsnapchat: text('idsnapchat'),
  idbing: text('idbing'),
  idvistar: text('idvistar'),
  idga4: text('idga4'),
  idmerchantcentre: text('idmerchantcentre'),
  idshopify: text('idshopify'),
  paymentDays: bigint('payment_days', { mode: "number" }),
  paymentTerms: text('payment_terms'),
  brandColour: text('brand_colour'),
  clientLogo: jsonb('client_logo'),
  website: text('website'),
  facebookUrl: text('facebook_url'),
  instagramUrl: text('instagram_url'),
  linkedinUrl: text('linkedin_url'),
  tiktokUrl: text('tiktok_url'),
  clientBrain: text('client_brain'),
  clientBrainUpdatedAt: timestamp('client_brain_updated_at', { withTimezone: true, mode: "string" }),
  /** Persisted dashboard / Auth0 tenant slug (0020). Unique lower(trim). */
  slug: text('slug'),
  /** SharePoint site URL path or absolute URL (0020 / M1). */
  sharepointSiteUrl: text('sharepoint_site_url'),
  /** Microsoft Teams / M365 group id (0020 / M1). */
  teamsGroupId: text('teams_group_id'),
  /**
   * Exactly one true per lower(trim(mbaidentifier)) group (partial unique).
   * Group site URL derives from the anchor's mbaidentifier via siteUrlForClient.
   */
  m365IsAnchor: boolean('m365_is_anchor').notNull().default(false),
  /** Fireflies title-match aliases (Penfold's, BOSS, GA, …). */
  clientNameAliases: jsonb("client_name_aliases").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    uniqueIndex("uq_clients_m365_anchor_mbaidentifier")
      .on(sql`lower(btrim(${table.mbaidentifier}))`)
      .where(
        sql`${table.m365IsAnchor} AND ${table.mbaidentifier} IS NOT NULL AND btrim(${table.mbaidentifier}) <> ''`,
      ),
    uniqueIndex("uq_clients_slug_lower")
      .on(sql`lower(btrim(${table.slug}))`)
      .where(sql`${table.slug} IS NOT NULL AND btrim(${table.slug}) <> ''`),
  ],
)

export const creativeAsset = pgTable(
  "creative_asset",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  mbaNumber: text('mba_number'),
  mediaPlanMasterId: bigint('media_plan_master_id', { mode: "number" }),
  lineItemId: text('line_item_id'),
  sourceTable: text('source_table'),
  assetName: text('asset_name'),
  originalFilename: text('original_filename'),
  mimeType: text('mime_type'),
  fileSizeBytes: bigint('file_size_bytes', { mode: "number" }),
  widthPx: bigint('width_px', { mode: "number" }),
  heightPx: bigint('height_px', { mode: "number" }),
  durationSeconds: numeric('duration_seconds'),
  blobUrl: text('blob_url'),
  blobPathname: text('blob_pathname'),
  status: text('status'),
  uploadedByEmail: text('uploaded_by_email'),
  uploadedByRole: text('uploaded_by_role'),
  },
  (table) => [
    index("idx_creative_asset_created_at").on(table.createdAt),
    index("idx_creative_asset_mba_number").on(table.mbaNumber),
  ],
)

export const displaySite = pgTable(
  "display_site",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  platform: text('platform'),
  site: text('site'),
  },
  (table) => [
    index("idx_display_site_created_at").on(table.createdAt),
  ],
)

export const financeBillingLineItems = pgTable(
  "finance_billing_line_items",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  financeBillingRecordsId: bigint('finance_billing_records_id', { mode: "number" }),
  itemCode: text('item_code'),
  lineType: text('line_type'),
  mediaType: text('media_type'),
  description: text('description'),
  publisherName: text('publisher_name'),
  amount: numeric('amount'),
  clientPaysMedia: boolean('client_pays_media'),
  sortOrder: bigint('sort_order', { mode: "number" }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: "string" }),
  lineItemId: text('line_item_id'),
  lineStatus: text('line_status'),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: "string" }),
  receivedAmount: numeric('received_amount'),
  note: text('note'),
  orphaned: boolean('orphaned'),
  mediaPlanVersionNumber: bigint('media_plan_version_number', { mode: "number" }),
  },
  (table) => [
    index("idx_finance_billing_line_items_created_at").on(table.createdAt),
    index("idx_finance_billing_line_items_finance_billing_records_id_line_item_id").on(table.financeBillingRecordsId, table.lineItemId),
  ],
)

export const financeBillingRecords = pgTable(
  "finance_billing_records",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  clientsId: bigint('clients_id', { mode: "number" }),
  clientName: text('client_name'),
  billingType: text('billing_type'),
  mbaNumber: text('mba_number'),
  campaignName: text('campaign_name'),
  poNumber: text('po_number'),
  billingMonth: text('billing_month'),
  invoiceDate: date('invoice_date'),
  paymentDays: bigint('payment_days', { mode: "number" }),
  paymentTerms: text('payment_terms'),
  status: text('status'),
  total: numeric('total'),
  hasPendingEdits: boolean('has_pending_edits'),
  sourceBillingScheduleId: bigint('source_billing_schedule_id', { mode: "number" }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: "string" }),
  billed: boolean('billed'),
  billedAt: timestamp('billed_at', { withTimezone: true, mode: "string" }),
  billedBy: bigint('billed_by', { mode: "number" }),
  /** Integer cents (Xano `billed_amount` dollars × 100). */
  billedAmountCents: bigint('billed_amount_cents', { mode: "number" }),
  billedLinesHash: text('billed_lines_hash'),
  notes: text('notes'),
  exportedAt: timestamp('exported_at', { withTimezone: true, mode: "string" }),
  exportedBy: bigint('exported_by', { mode: "number" }),
  invoiceKey: text('invoice_key'),
  },
  (table) => [
    index("idx_finance_billing_records_created_at").on(table.createdAt),
    uniqueIndex("idx_finance_billing_records_invoice_key").on(table.invoiceKey),
  ],
)

export const financeEdits = pgTable(
  "finance_edits",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  financeBillingRecordsId: bigint('finance_billing_records_id', { mode: "number" }),
  financeBillingLineItemsId: bigint('finance_billing_line_items_id', { mode: "number" }),
  editType: text('edit_type'),
  fieldName: text('field_name'),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  editStatus: text('edit_status'),
  editedBy: bigint('edited_by', { mode: "number" }),
  editedByName: text('edited_by_name'),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: "string" }),
  recordType: text('record_type'),
  },
  (table) => [
    index("idx_finance_edits_created_at").on(table.createdAt),
  ],
)

export const financeSavedViews = pgTable(
  "finance_saved_views",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  userId: bigint('user_id', { mode: "number" }),
  viewName: text('view_name'),
  filters: jsonb('filters'),
  isDefault: boolean('is_default'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("idx_finance_saved_views_created_at").on(table.createdAt),
  ],
)

export const magazines = pgTable(
  "magazines",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  network: text('network'),
  title: text('title'),
  },
  (table) => [
    index("idx_magazines_created_at").on(table.createdAt),
  ],
)

export const magazinesAdsizes = pgTable(
  "magazines_adsizes",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  adsize: text('adsize'),
  },
  (table) => [
    index("idx_magazines_adsizes_created_at").on(table.createdAt),
  ],
)

export const mediaContainerBestPractice = pgTable(
  "media_container_best_practice",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: "string" }),
  mediaContainer: text('media_container'),
  bestPractice: jsonb('best_practice'),
  isActive: boolean('is_active'),
  Name: text('_name'),
  },
  (table) => [
    uniqueIndex("idx_media_container_best_practice_media_container").on(table.mediaContainer),
  ],
)

export const newspaperAdsizes = pgTable(
  "newspaper_adsizes",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  adsize: text('adsize'),
  },
  (table) => [
    index("idx_newspaper_adsizes_created_at").on(table.createdAt),
  ],
)

export const newspapers = pgTable(
  "newspapers",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  network: text('network'),
  title: text('title'),
  },
  (table) => [
    index("idx_newspapers_created_at").on(table.createdAt),
  ],
)

export const pacingOrphanFixes = pgTable(
  "pacing_orphan_fixes",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  adminUserEmail: text('admin_user_email'),
  channel: text('channel'),
  platformLineItemId: text('platform_line_item_id'),
  previousLineItemId: text('previous_line_item_id'),
  newLineItemId: text('new_line_item_id'),
  adGroupName: text('ad_group_name'),
  campaignName: text('campaign_name'),
  note: text('note'),
  },
)

export const planningAudiences = pgTable(
  "planning_audiences",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  clientsId: bigint('clients_id', { mode: "number" }),
  mbaNumber: text('mba_number'),
  name: text('name'),
  definitionJson: jsonb('definition_json'),
  composedWc: numeric('composed_wc'),
  clientVisible: boolean('client_visible'),
  createdByEmail: text('created_by_email'),
  },
  (table) => [
    index("idx_planning_audiences_clients_id").on(table.clientsId),
    index("idx_planning_audiences_mba_number").on(table.mbaNumber),
  ],
)

export const publisherKpi = pgTable(
  "publisher_kpi",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  publisher: text('publisher'),
  bidStrategy: text('bid_strategy'),
  ctr: numeric('ctr'),
  cpv: numeric('cpv'),
  conversionRate: numeric('conversion_rate'),
  vtr: numeric('vtr'),
  frequency: numeric('frequency'),
  mediaType: text('media_type'),
  },
  (table) => [
    index("idx_publisher_kpi_created_at").on(table.createdAt),
  ],
)

export const publishers = pgTable(
  "publishers",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  publisherName: text('publisher_name'),
  publisherid: text('publisherid'),
  publishertype: text('publishertype'),
  billingagency: text('billingagency'),
  financecode: text('financecode'),
  pubTelevision: boolean('pub_television'),
  pubRadio: boolean('pub_radio'),
  pubNewspaper: boolean('pub_newspaper'),
  pubMagazines: boolean('pub_magazines'),
  pubOoh: boolean('pub_ooh'),
  pubCinema: boolean('pub_cinema'),
  pubDigidisplay: boolean('pub_digidisplay'),
  pubDigiaudio: boolean('pub_digiaudio'),
  pubDigivideo: boolean('pub_digivideo'),
  pubBvod: boolean('pub_bvod'),
  pubIntegration: boolean('pub_integration'),
  pubSearch: boolean('pub_search'),
  pubSocialmedia: boolean('pub_socialmedia'),
  pubProgdisplay: boolean('pub_progdisplay'),
  pubProgvideo: boolean('pub_progvideo'),
  pubProgbvod: boolean('pub_progbvod'),
  pubProgaudio: boolean('pub_progaudio'),
  pubProgooh: boolean('pub_progooh'),
  pubInfluencers: boolean('pub_influencers'),
  radioComms: numeric('radio_comms'),
  newspaperComms: numeric('newspaper_comms'),
  televisionComms: numeric('television_comms'),
  magazinesComms: numeric('magazines_comms'),
  oohComms: numeric('ooh_comms'),
  cinemaComms: numeric('cinema_comms'),
  digidisplayComms: numeric('digidisplay_comms'),
  digiaudioComms: numeric('digiaudio_comms'),
  digivideoComms: numeric('digivideo_comms'),
  bvodComms: numeric('bvod_comms'),
  integrationComms: numeric('integration_comms'),
  searchComms: numeric('search_comms'),
  progdisplayComms: numeric('progdisplay_comms'),
  progvideoComms: numeric('progvideo_comms'),
  progbvodComms: numeric('progbvod_comms'),
  progaudioComms: numeric('progaudio_comms'),
  progoohComms: numeric('progooh_comms'),
  influencersComms: numeric('influencers_comms'),
  digitaldisplayCpmDefault: numeric('digitaldisplay_cpm_default'),
  digitaldisplayCpcDefault: numeric('digitaldisplay_cpc_default'),
  digitaldisplayCpvDefault: numeric('digitaldisplay_cpv_default'),
  digitaldisplayCtrDefault: numeric('digitaldisplay_ctr_default'),
  digitaldisplayVtrDefault: numeric('digitaldisplay_vtr_default'),
  digitaldisplayFrequencyDefault: numeric('digitaldisplay_frequency_default'),
  digitalvideoCpmDefault: numeric('digitalvideo_cpm_default'),
  digitalvideoCpcDefault: numeric('digitalvideo_cpc_default'),
  digitalvideoCpvDefault: numeric('digitalvideo_cpv_default'),
  digitalvideoCtrDefault: numeric('digitalvideo_ctr_default'),
  digitalvideoVtrDefault: numeric('digitalvideo_vtr_default'),
  digitalvideoFrequencyDefault: numeric('digitalvideo_frequency_default'),
  digitalaudioCpmDefault: numeric('digitalaudio_cpm_default'),
  digitalaudioCpcDefault: numeric('digitalaudio_cpc_default'),
  digitalaudioCpvDefault: numeric('digitalaudio_cpv_default'),
  digitalaudioCtrDefault: numeric('digitalaudio_ctr_default'),
  digitalaudioVtrDefault: numeric('digitalaudio_vtr_default'),
  digitalaudioFrequencyDefault: numeric('digitalaudio_frequency_default'),
  bvodCpmDefault: numeric('bvod_cpm_default'),
  bvodCpcDefault: numeric('bvod_cpc_default'),
  bvodCpvDefault: numeric('bvod_cpv_default'),
  bvodCtrDefault: numeric('bvod_ctr_default'),
  bvodVtrDefault: numeric('bvod_vtr_default'),
  bvodFrequencyDefault: numeric('bvod_frequency_default'),
  searchCpmDefault: numeric('search_cpm_default'),
  searchCpcDefault: numeric('search_cpc_default'),
  searchCpvDefault: numeric('search_cpv_default'),
  searchCtrDefault: numeric('search_ctr_default'),
  searchVtrDefault: numeric('search_vtr_default'),
  searchFrequencyDefault: numeric('search_frequency_default'),
  socialmediaCpmDefault: numeric('socialmedia_cpm_default'),
  socialmediaCpcDefault: numeric('socialmedia_cpc_default'),
  socialmediaCpvDefault: numeric('socialmedia_cpv_default'),
  socialmediaCtrDefault: numeric('socialmedia_ctr_default'),
  socialmediaVtrDefault: numeric('socialmedia_vtr_default'),
  socialmediaFrequencyDefault: numeric('socialmedia_frequency_default'),
  progdisplayCpmDefault: numeric('progdisplay_cpm_default'),
  progdisplayCpcDefault: numeric('progdisplay_cpc_default'),
  progdisplayCpvDefault: numeric('progdisplay_cpv_default'),
  progdisplayCtrDefault: numeric('progdisplay_ctr_default'),
  progdisplayVtrDefault: numeric('progdisplay_vtr_default'),
  progdisplayFrequencyDefault: numeric('progdisplay_frequency_default'),
  progvideoCpmDefault: numeric('progvideo_cpm_default'),
  progvideoCpcDefault: numeric('progvideo_cpc_default'),
  progvideoCpvDefault: numeric('progvideo_cpv_default'),
  progvideoCtrDefault: numeric('progvideo_ctr_default'),
  progvideoVtrDefault: numeric('progvideo_vtr_default'),
  progvideoFrequencyDefault: numeric('progvideo_frequency_default'),
  progbvodCpmDefault: numeric('progbvod_cpm_default'),
  progbvodCpcDefault: numeric('progbvod_cpc_default'),
  progbvodCpvDefault: numeric('progbvod_cpv_default'),
  progbvodCtrDefault: numeric('progbvod_ctr_default'),
  progbvodVtrDefault: numeric('progbvod_vtr_default'),
  progbvodFrequencyDefault: numeric('progbvod_frequency_default'),
  progaudioCpmDefault: numeric('progaudio_cpm_default'),
  progaudioCpcDefault: numeric('progaudio_cpc_default'),
  progaudioCpvDefault: numeric('progaudio_cpv_default'),
  progaudioCtrDefault: numeric('progaudio_ctr_default'),
  progaudioVtrDefault: numeric('progaudio_vtr_default'),
  progaudioFrequencyDefault: numeric('progaudio_frequency_default'),
  publisherColour: text('publisher_colour'),
  bestPractice: jsonb('best_practice'),
  },
)

export const radioStations = pgTable(
  "radio_stations",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  station: text('station'),
  network: text('network'),
  },
  (table) => [
    index("idx_radio_stations_created_at").on(table.createdAt),
  ],
)

export const financeForecastSnapshots = pgTable(
  "finance_forecast_snapshots",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    snapshotLabel: text("snapshot_label").notNull(),
    snapshotType: text("snapshot_type").notNull(),
    financialYear: integer("financial_year").notNull(),
    scenario: text("scenario").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true, mode: "string" }).notNull(),
    takenBy: text("taken_by"),
    notes: text("notes"),
    sourceVersionSummary: text("source_version_summary"),
    filterContextJson: text("filter_context_json"),
  },
  (table) => [
    index("idx_finance_forecast_snapshots_fy_scenario_taken").on(
      table.financialYear,
      table.scenario,
      table.takenAt
    ),
  ],
)

export const financeForecastSnapshotLines = pgTable(
  "finance_forecast_snapshot_lines",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    snapshotId: bigint("snapshot_id", { mode: "number" })
      .notNull()
      .references(() => financeForecastSnapshots.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    clientName: text("client_name").notNull(),
    campaignId: text("campaign_id"),
    mbaNumber: text("mba_number"),
    mediaPlanVersionId: text("media_plan_version_id"),
    versionNumber: bigint("version_number", { mode: "number" }),
    groupKey: text("group_key").notNull(),
    lineKey: text("line_key").notNull(),
    monthKey: text("month_key").notNull(),
    amount: numeric("amount").notNull(),
    fyTotal: numeric("fy_total").notNull(),
    sourceHash: text("source_hash"),
    sourceDebugJson: text("source_debug_json"),
  },
  (table) => [
    index("idx_ffsl_snapshot_client_line_month").on(
      table.snapshotId,
      table.clientId,
      table.lineKey,
      table.monthKey
    ),
    index("idx_ffsl_snapshot_group_line_month").on(
      table.snapshotId,
      table.groupKey,
      table.lineKey,
      table.monthKey
    ),
    index("idx_ffsl_snapshot_month").on(table.snapshotId, table.monthKey),
  ],
)

export const revenueForecastLines = pgTable(
  "revenue_forecast_lines",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  clientsId: bigint('clients_id', { mode: "number" }),
  fy: text('fy'),
  lineKey: text('line_key'),
  month: text('month'),
  amount: numeric('amount'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("idx_revenue_forecast_lines_clients_id").on(table.clientsId),
    index("idx_revenue_forecast_lines_fy").on(table.fy),
    uniqueIndex("idx_revenue_forecast_lines_natural_key").on(
      table.clientsId,
      table.fy,
      table.lineKey,
      table.month
    ),
  ],
)

export const revenueLineCatalog = pgTable(
  "revenue_line_catalog",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  lineKey: text('line_key'),
  label: text('label'),
  feePct: numeric('fee_pct'),
  bookedMapping: jsonb('booked_mapping'),
  sortOrder: bigint('sort_order', { mode: "number" }),
  active: boolean('active'),
  },
  (table) => [
    uniqueIndex("idx_revenue_line_catalog_line_key").on(table.lineKey),
  ],
)

export const scopeOfWork = pgTable(
  "scope_of_work",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  clientName: text('client_name'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  scopeDate: date('scope_date'),
  scopeVersion: bigint('scope_version', { mode: "number" }),
  projectName: text('project_name'),
  projectStatus: text('project_status'),
  projectOverview: text('project_overview'),
  deliverables: text('deliverables'),
  tasksSteps: text('tasks_steps'),
  timelines: text('timelines'),
  responsibilities: text('responsibilities'),
  requirements: text('requirements'),
  assumptions: text('assumptions'),
  exclusions: text('exclusions'),
  cost: jsonb('cost'),
  paymentTermsAndConditions: text('payment_terms_and_conditions'),
  scopeId: text('scope_id'),
  billingSchedule: jsonb('billing_schedule'),
  },
  (table) => [
    index("idx_scope_of_work_created_at").on(table.createdAt),
  ],
)

export const tvStations = pgTable(
  "tv_stations",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  network: text('network'),
  station: text('station'),
  },
  (table) => [
    index("idx_tv_stations_created_at").on(table.createdAt),
  ],
)

export const videoSite = pgTable(
  "video_site",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  platform: text('platform'),
  site: text('site'),
  },
  (table) => [
    index("idx_video_site_created_at").on(table.createdAt),
  ],
)

export const xeroApBills = pgTable(
  "xero_ap_bills",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  xeroInvoiceId: text('xero_invoice_id'),
  invoiceNumber: text('invoice_number'),
  xeroContactId: text('xero_contact_id'),
  status: text('status'),
  subTotal: numeric('sub_total'),
  totalTax: numeric('total_tax'),
  total: numeric('total'),
  amountPaid: numeric('amount_paid'),
  amountDue: numeric('amount_due'),
  currency: text('currency'),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  fullyPaidDate: date('fully_paid_date'),
  activityMonth: date('activity_month'),
  referenceRaw: text('reference_raw'),
  lineItemsJson: jsonb('line_items_json'),
  pdfFile: jsonb('pdf_file'),
  xeroUpdatedUtc: timestamp('xero_updated_utc', { withTimezone: true, mode: "string" }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: "string" }),
  rawJson: jsonb('raw_json'),
  },
  (table) => [
    uniqueIndex("idx_xero_ap_bills_xero_invoice_id").on(table.xeroInvoiceId),
  ],
)

export const xeroArInvoices = pgTable(
  "xero_ar_invoices",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  xeroInvoiceId: text('xero_invoice_id'),
  invoiceNumber: text('invoice_number'),
  xeroContactId: text('xero_contact_id'),
  status: text('status'),
  subTotal: numeric('sub_total'),
  totalTax: numeric('total_tax'),
  total: numeric('total'),
  amountPaid: numeric('amount_paid'),
  amountDue: numeric('amount_due'),
  currency: text('currency'),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  fullyPaidDate: date('fully_paid_date'),
  referenceRaw: text('reference_raw'),
  mbaNumber: text('mba_number'),
  mbaMatchId: bigint('mba_match_id', { mode: "number" }),
  lineItemsJson: jsonb('line_items_json'),
  pdfFile: jsonb('pdf_file'),
  xeroUpdatedUtc: timestamp('xero_updated_utc', { withTimezone: true, mode: "string" }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: "string" }),
  rawJson: jsonb('raw_json'),
  },
  (table) => [
    uniqueIndex("idx_xero_ar_invoices_xero_invoice_id").on(table.xeroInvoiceId),
  ],
)

export const xeroContacts = pgTable(
  "xero_contacts",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  xeroContactId: text('xero_contact_id'),
  name: text('name'),
  role: text('role'),
  email: text('email'),
  rawJson: jsonb('raw_json'),
  syncedAt: timestamp('synced_at', { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("idx_xero_contacts_xero_contact_id").on(table.xeroContactId),
  ],
)

export const xeroSyncExceptions = pgTable(
  "xero_sync_exceptions",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  xeroInvoiceId: text('xero_invoice_id'),
  invoiceNumber: text('invoice_number'),
  reference: text('reference'),
  reason: text('reason'),
  rawJson: jsonb('raw_json'),
  resolved: boolean('resolved'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  issueDate: text('issue_date'),
  },
)

export const xeroSyncLog = pgTable(
  "xero_sync_log",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  runStartedAt: timestamp('run_started_at', { withTimezone: true, mode: "string" }),
  runFinishedAt: timestamp('run_finished_at', { withTimezone: true, mode: "string" }),
  status: text('status'),
  watermarkUsed: timestamp('watermark_used', { withTimezone: true, mode: "string" }),
  newWatermark: timestamp('new_watermark', { withTimezone: true, mode: "string" }),
  invoicesUpserted: bigint('invoices_upserted', { mode: "number" }),
  contactsUpserted: bigint('contacts_upserted', { mode: "number" }),
  notes: text('notes'),
  },
)

/** Manual alias map: normalised Xero contact name → clients.id (T5). */
export const xeroClientAliases = pgTable(
  "xero_client_aliases",
  {
    id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
    contactKey: text("contact_key").notNull(),
    clientId: bigint("client_id", { mode: "number" })
      .notNull()
      .references(() => clients.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_xero_client_aliases_contact_key").on(table.contactKey),
  ],
)

