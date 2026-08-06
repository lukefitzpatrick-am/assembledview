/**
 * Recorded Xano MBA GET shape — 2026-08-01 export snapshot (trimmed).
 *
 * Captures the field names / types / identifier-string contract the editor and
 * dashboards expect from `GET /api/mediaplans/mba/[mba_number]`. Used by the
 * C-22 shape-parity suite (DI-9 / DI-10). Not a live network capture.
 */

import {
  createEmptyMbaGetLineItems,
  type MbaGetMediaLineItems,
} from "@/lib/mediaplan/mbaGetAssemble"

/** MBA with leading zeros — must stay a string (DI-10). */
export const FIXTURE_MBA_NUMBER = "001042"

/** Published watermark (= master.version_number). Tip equals published here. */
export const FIXTURE_PUBLISHED_VERSION = 2

/** Staged tip used only in the intentional nextVersionNumber gap case. */
export const FIXTURE_TIP_WITH_STAGED = 3

export const FIXTURE_MASTER_XANO: Record<string, unknown> = {
  id: 1108,
  mba_number: FIXTURE_MBA_NUMBER,
  mp_client_name: "Acme Co",
  mp_campaignname: "FY26 Brand",
  campaign_name: "FY26 Brand",
  version_number: FIXTURE_PUBLISHED_VERSION,
  campaign_status: "approved",
  campaign_start_date: "2025-01-01",
  campaign_end_date: "2025-03-31",
  mp_campaignbudget: 50000,
  published_version_id: 2202,
  client_id: 44,
  created_at: 1735689600000,
  // Xano-only denormalised scalars (no PG column) — intentional absence on PG path
  inputs_hash: "abc123",
  rebill_needed: false,
  latest_version_id: 2202,
  temp_version_number: null,
}

export const FIXTURE_VERSION_XANO: Record<string, unknown> = {
  id: 2202,
  mba_number: FIXTURE_MBA_NUMBER,
  version_number: FIXTURE_PUBLISHED_VERSION,
  media_plan_master_id: 1108,
  campaign_name: "FY26 Brand",
  campaign_status: "approved",
  campaign_start_date: "2025-01-01",
  campaign_end_date: "2025-03-31",
  brand: "Acme",
  client_contact: "jane@acme.test",
  po_number: "PO-0042",
  mp_campaignbudget: 50000,
  fixed_fee: null,
  // VC Stage 1 columns — Xano historically lacked these; parity fixtures pin null.
  published_at: null,
  published_by: null,
  // Version rows historically omit mp_client_name in Postgres; Xano _latest may
  // denormalise it — overlay from master is required (DI-9).
  mp_television: false,
  mp_search: true,
  mp_socialmedia: true,
  billingSchedule: [
    {
      month: "2025-01-01",
      channel: "Search",
      spend: 10000,
    },
    {
      month: "2025-02-01",
      channel: "Social",
      spend: 15000,
    },
  ],
  deliverySchedule: [
    {
      month: "2025-01-01",
      channel: "Search",
      spend: 10000,
    },
    {
      month: "2025-02-01",
      channel: "Social",
      spend: 15000,
    },
  ],
  media_plan: null,
  mba_pdf: null,
  aa_media_plan: null,
  created_at: 1735689600000,
}

/** Postgres line_items row shape (camelCase / Drizzle) for search. */
export const FIXTURE_PG_LINE_SEARCH: Record<string, unknown> = {
  id: 9001,
  createdAt: "2025-01-05T00:00:00.000Z",
  channel: "search",
  lineItemId: `${FIXTURE_MBA_NUMBER}SE1`,
  position: 1,
  market: "Australia",
  buyingDemo: null,
  buyType: "cpc",
  publisher: "Google",
  platform: "Search",
  bidStrategy: null,
  fixedCostMedia: false,
  clientPaysForMedia: false,
  budgetIncludesFees: false,
  noAdserving: null,
  bursts: [
    {
      budget: "$10000",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    },
  ],
  attrs: {
    campaign: "Brand",
    adgroup: "Exact",
    keyword: "acme",
  },
}

/** Postgres line_items row for social. */
export const FIXTURE_PG_LINE_SOCIAL: Record<string, unknown> = {
  id: 9002,
  createdAt: "2025-01-05T00:00:00.000Z",
  channel: "social",
  lineItemId: `${FIXTURE_MBA_NUMBER}SM1`,
  position: 1,
  market: "Australia",
  buyingDemo: "18-54",
  buyType: "cpm",
  publisher: "Meta",
  platform: "Facebook",
  bidStrategy: null,
  fixedCostMedia: false,
  clientPaysForMedia: false,
  budgetIncludesFees: false,
  noAdserving: null,
  bursts: [
    {
      budget: "$15000",
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    },
  ],
  attrs: {
    objective: "Traffic",
    placement: "Feed",
  },
}

export const FIXTURE_VERSIONS_META = [
  {
    id: 2201,
    version_number: 1,
    created_at: 1704067200000,
    published_at: null,
    published_by: null,
  },
  {
    id: 2202,
    version_number: 2,
    created_at: 1735689600000,
    published_at: null,
    published_by: null,
  },
]

export function emptyLineItems(): MbaGetMediaLineItems {
  return createEmptyMbaGetLineItems()
}
