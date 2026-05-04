import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"

/**
 * Container keys that align with `MEDIA_TYPE_ID_CODES` in `lib/mediaplan/lineItemIds.ts`.
 * `production` is used in media containers and MBA line-item maps but has no `MEDIA_TYPE_ID_CODES` entry.
 */
export type XanoMediaPlanContainerKey = keyof typeof MEDIA_TYPE_ID_CODES | "production"

/**
 * One Xano “media plan” table (list endpoint under the Media Plans API group).
 * `table_name` is the path segment and should match `SOURCE_TABLE` in
 * `ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT`.
 */
export interface XanoMediaPlanTable {
  table_name: string
  /** Path segment for `xanoUrl()` / REST (leading slash optional). */
  api_path: string
  /**
   * Xano API group instance id (Media Plans). Confirm in workspace OpenAPI when available;
   * deployed calls use the full base URL from `XANO_MEDIA_PLANS_BASE_URL` or `XANO_MEDIAPLANS_BASE_URL`.
   */
  api_group: string
  /** Key aligned with `MEDIA_TYPE_ID_CODES` where present; see type alias for `production`. */
  container_key: XanoMediaPlanContainerKey
}

/** Stated group id for Media Plans — verify in Xano if paths move between groups. */
export const XANO_MEDIA_PLANS_API_GROUP_ID = "RaUx9FOa" as const

/**
 * All 20 media plan list tables, aligned with `MEDIA_TYPE_ENDPOINTS` in
 * `app/api/mediaplans/mba/[mba_number]/route.ts`.
 *
 * Note: integration uses **`media_plan_integrations`** (plural), not `media_plan_integration`.
 */
export const MEDIA_PLAN_TABLES: XanoMediaPlanTable[] = [
  { table_name: "media_plan_television", api_path: "/media_plan_television", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "television" },
  { table_name: "media_plan_newspaper", api_path: "/media_plan_newspaper", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "newspaper" },
  { table_name: "media_plan_social", api_path: "/media_plan_social", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "socialMedia" },
  { table_name: "media_plan_radio", api_path: "/media_plan_radio", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "radio" },
  { table_name: "media_plan_magazines", api_path: "/media_plan_magazines", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "magazines" },
  { table_name: "media_plan_cinema", api_path: "/media_plan_cinema", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "cinema" },
  { table_name: "media_plan_digi_display", api_path: "/media_plan_digi_display", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "digitalDisplay" },
  { table_name: "media_plan_digi_audio", api_path: "/media_plan_digi_audio", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "digitalAudio" },
  { table_name: "media_plan_digi_video", api_path: "/media_plan_digi_video", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "digitalVideo" },
  { table_name: "media_plan_digi_bvod", api_path: "/media_plan_digi_bvod", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "bvod" },
  { table_name: "media_plan_integrations", api_path: "/media_plan_integrations", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "integration" },
  { table_name: "media_plan_search", api_path: "/media_plan_search", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "search" },
  { table_name: "media_plan_prog_display", api_path: "/media_plan_prog_display", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "progDisplay" },
  { table_name: "media_plan_prog_video", api_path: "/media_plan_prog_video", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "progVideo" },
  { table_name: "media_plan_prog_bvod", api_path: "/media_plan_prog_bvod", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "progBVOD" },
  { table_name: "media_plan_prog_audio", api_path: "/media_plan_prog_audio", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "progAudio" },
  { table_name: "media_plan_prog_ooh", api_path: "/media_plan_prog_ooh", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "progOOH" },
  { table_name: "media_plan_ooh", api_path: "/media_plan_ooh", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "ooh" },
  { table_name: "media_plan_influencers", api_path: "/media_plan_influencers", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "influencers" },
  { table_name: "media_plan_production", api_path: "/media_plan_production", api_group: XANO_MEDIA_PLANS_API_GROUP_ID, container_key: "production" },
]
