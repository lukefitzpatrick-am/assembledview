/**
 * Human labels for draft `fieldPath` values shown in View changes.
 *
 * Lookup order:
 * 1. Exact `fieldPath` in `FIELD_LABELS`
 * 2. Burst path `bursts.{i}.{leaf}` → `Burst {i+1} {leaf label}` (1-based)
 * 3. Leaf key in `FIELD_LABELS`
 * 4. Fallback: split on `.`, replace numeric segments with `Burst N` (1-based),
 *    de-snake-case and split camelCase each segment, join with ` · `.
 *
 * Never return the raw path.
 */

export const CAMPAIGN_DRAFT_LINE_ID = ""

/** Snapshot channel bag keys from `buildPlanDraftSnapshot` / edit `getSnapshot`. */
export const DRAFT_CHANNEL_ORDER = [
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digiDisplay",
  "digiAudio",
  "digiVideo",
  "bvod",
  "integration",
  "production",
  "search",
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "influencers",
] as const

const CHANNEL_LABELS: Record<string, string> = {
  television: "Television",
  radio: "Radio",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  cinema: "Cinema",
  digiDisplay: "Digital Display",
  digiAudio: "Digital Audio",
  digiVideo: "Digital Video",
  digitalDisplay: "Digital Display",
  digitalAudio: "Digital Audio",
  digitalVideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  production: "Production",
  search: "Search",
  socialMedia: "Social",
  progDisplay: "Prog Display",
  progVideo: "Prog Video",
  progBvod: "Prog BVOD",
  progAudio: "Prog Audio",
  progOoh: "Prog OOH",
  influencers: "Influencers",
}

const FIELD_LABELS: Record<string, string> = {
  // Campaign formValues
  mp_campaignbudget: "Campaign budget",
  mp_campaigndates_start: "Start date",
  mp_campaigndates_end: "End date",
  mp_campaignstatus: "Campaign status",
  mp_campaignname: "Campaign name",
  mp_clientname: "Client",
  mbanumber: "MBA number",
  mbaidentifier: "MBA identifier",
  mp_brand: "Brand",
  mp_clientcontact: "Client contact",
  mp_ponumber: "PO number",
  mp_plannumber: "Plan number",
  mp_fixedfee: "Fixed fee",
  mp_production: "Production",
  mp_television: "Television",
  mp_radio: "Radio",
  mp_newspaper: "Newspaper",
  mp_magazines: "Magazines",
  mp_ooh: "OOH",
  mp_cinema: "Cinema",
  mp_digidisplay: "Digital Display",
  mp_digiaudio: "Digital Audio",
  mp_digivideo: "Digital Video",
  mp_bvod: "BVOD",
  mp_integration: "Integration",
  mp_search: "Search",
  mp_socialmedia: "Social",
  mp_progdisplay: "Prog Display",
  mp_progvideo: "Prog Video",
  mp_progbvod: "Prog BVOD",
  mp_progaudio: "Prog Audio",
  mp_progooh: "Prog OOH",
  mp_influencers: "Influencers",

  // Line + burst leaves (snake from hydrate, camel from expert cards)
  budget: "Budget",
  buyAmount: "Buy amount",
  startDate: "Start date",
  endDate: "End date",
  amount: "Amount",
  cost: "Cost",
  description: "Description",
  unitRate: "Unit rate",
  netMedia: "Net media",
  feePct: "Fee %",
  fee_pct: "Fee %",
  platform: "Platform",
  publisher: "Publisher",
  network: "Network",
  station: "Station",
  site: "Site",
  format: "Format",
  placement: "Placement",
  type: "Type",
  size: "Size",
  market: "Market",
  duration: "Duration",
  targeting: "Targeting",
  targetingAttribute: "Targeting",
  targeting_attribute: "Targeting",
  creative: "Creative",
  creative_targeting: "Creative targeting",
  creativeTargeting: "Creative targeting",
  bid_strategy: "Bid strategy",
  bidStrategy: "Bid strategy",
  buy_type: "Buy type",
  buyType: "Buy type",
  buying_demo: "Buying demo",
  buyingDemo: "Buying demo",
  budget_includes_fees: "Budget includes fees",
  budgetIncludesFees: "Budget includes fees",
  client_pays_for_media: "Client pays for media",
  clientPaysForMedia: "Client pays for media",
  fixed_cost_media: "Fixed-cost media",
  fixedCostMedia: "Fixed-cost media",
  no_adserving: "No ad serving",
  noAdserving: "No ad serving",
  noadserving: "No ad serving",
  line_item: "Line item",
  line_item_id: "Line ID",
  lineItemId: "Line ID",
  mba_number: "MBA number",
  media_plan_version: "Plan version",
  media_type: "Media type",
  mp_client_name: "Client",
  objective: "Objective",
  campaign: "Campaign",
}

const BURST_PATH = /^bursts\.(\d+)\.(.+)$/

function humanizeSegment(seg: string): string {
  const spaced = seg
    .replace(/_/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
  if (!spaced) return seg
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

/** Fallback when `fieldPath` is not in the map. Documented in the file header. */
export function fallbackDraftFieldLabel(fieldPath: string): string {
  const parts = fieldPath.split(".").filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      out.push(`Burst ${Number(part) + 1}`)
      continue
    }
    out.push(humanizeSegment(part))
  }
  return out.join(" · ") || "Field"
}

export function draftFieldLabel(fieldPath: string): string {
  const mapped = FIELD_LABELS[fieldPath]
  if (mapped) return mapped
  const burst = fieldPath.match(BURST_PATH)
  if (burst) {
    const n = Number(burst[1]) + 1
    const leaf = burst[2]
    const leafLabel = FIELD_LABELS[leaf] ?? humanizeSegment(leaf)
    return `Burst ${n} ${leafLabel}`
  }
  const leaf = fieldPath.split(".").pop() ?? fieldPath
  if (leaf !== fieldPath && FIELD_LABELS[leaf]) return FIELD_LABELS[leaf]
  return fallbackDraftFieldLabel(fieldPath)
}

export function draftChannelLabel(channel: string): string {
  if (!channel) return "Campaign"
  return CHANNEL_LABELS[channel] ?? humanizeSegment(channel)
}
