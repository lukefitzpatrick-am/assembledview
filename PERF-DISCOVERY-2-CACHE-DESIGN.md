# PERF-DISCOVERY-2 — Cache Design Inputs

Read-only discovery gathered 2026-07-06. PowerShell `Select-String` only.

---

## P1 — Pacing cache design inputs

### 1. `requirePacingAccess` (full — `lib/pacing/pacingAuth.ts`)

```typescript
import "server-only"

import axios from "axios"
import type { NextRequest, NextResponse } from "next/server"
import type { User } from "@auth0/nextjs-auth0/types"
import { auth0 } from "@/lib/auth0"
import { xanoUrl } from "@/lib/api/xano"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { getCachedClients } from "@/lib/cache/clientsCache"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"
import { pacingJsonError } from "@/lib/pacing/pacingHttp"

export type PacingSession = NonNullable<Awaited<ReturnType<typeof auth0.getSession>>> 

export type RequirePacingAccessResult =
  | { ok: true; session: PacingSession; allowedClientIds: number[] | null }
  | { ok: false; response: NextResponse }

/**
 * Resolves tenant client scope the same way as Finance Forecast:
 * - `null` allowedClientIds → no restriction (admin, or user without `client_slugs` claims).
 * - non-null array → only those numeric Xano `get_clients.id` values.
 * - empty array → no accessible clients (all Snowflake list queries return empty).
 */
export async function requirePacingAccess(request: NextRequest): Promise<RequirePacingAccessResult> {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return { ok: false, response: pacingJsonError("unauthorised", 401) }
  }

  const roles = getUserRoles(session.user)
  const isAdmin = roles.includes("admin")
  const tenantSlugs = getUserClientSlugs(session.user)

  if (isAdmin || tenantSlugs.length === 0) {
    return { ok: true, session, allowedClientIds: null }
  }

  const ids = await resolveXanoClientIdsFromUrlSlugs(tenantSlugs)
  return { ok: true, session, allowedClientIds: ids }
}
```

**Cache-key implication:** `allowedClientIds` is `null` (admin / unscoped) or a sorted list of numeric Xano client IDs derived from Auth0 `client_slugs` claims. Routes convert IDs → URL slugs via `resolveClientSlugs` before passing `allowedClientSlugs: Set<string> | null` to fetch functions.

---

### 2. `fetchSearchPacingCampaignRows` / `fetchSocialPacingCampaignRows` — parameter shape & `allowedClientSlugs`

#### `lib/pacing/campaigns/fetchSearchPacingCampaignRows.ts` (lines 1–86)

```typescript
import "server-only";

import { fetchAllXanoPages } from "@/lib/api/xanoPagination";
import { xanoUrl } from "@/lib/api/xano";
import { aggregateForLineItem } from "@/lib/pacing/campaigns/aggregate";
import { findCurrentBurstIndex, inclusiveDaysBetween } from "@/lib/pacing/burst/currentBurst";
import { parseBurstsToNormalised } from "@/lib/pacing/burst/parseBursts";
import type { KpiTargets, SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";
import { fetchCampaignKpisForMbas } from "@/lib/xano/campaignKpi";
import {
  computePacing,
  getMelbourneYesterdayISO,
  type PacingStatus,
} from "@/lib/pacing/maths";
import { slugifyPlanClientName } from "@/lib/pacing/scope/resolveClientSlugs";
import { getSearchCampaignsPacingData } from "@/lib/snowflake/search-campaigns-pacing";
import { isLiveCampaignStatus, type MediaPlanMaster } from "@/lib/types/mediaPlanMaster";

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const;

export type FetchSearchPacingCampaignRowsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
};

export type GetLiveSearchLineItemsArgs = FetchSearchPacingCampaignRowsArgs;

export type LiveSearchLineItemInput = {
  master: MediaPlanMaster;
  versionRow: VersionRow;
  searchRow: Record<string, unknown>;
};

/**
 * Resolves live search line items (masters, versions, Xano search rows)
 * without Snowflake hydration.
 */
export async function resolveLiveSearchLineItemInputs(
  args: GetLiveSearchLineItemsArgs
): Promise<LiveSearchLineItemInput[]> {
  const masters = await fetchAllMasters();
  const liveMasters = masters.filter((m) => {
    if (!isLiveCampaignStatus(m.campaign_status)) return false;
    if (!m.campaign_start_date || !m.campaign_end_date) return false;
    if (args.asOfDate < m.campaign_start_date || args.asOfDate > m.campaign_end_date) return false;
    if (args.allowedClientSlugs !== null) {
      const slug = slugifyPlanClientName(m.mp_client_name);
      if (!slug || !args.allowedClientSlugs.has(slug)) return false;
    }
    return true;
  });

  if (liveMasters.length === 0) return [];

  const versionRowsByMba = await fetchCurrentVersionRowsForMasters(liveMasters);
  const inputs: LiveSearchLineItemInput[] = [];

  for (const master of liveMasters) {
    const versionRow = versionRowsByMba.get(norm(master.mba_number));
    if (!versionRow) {
      console.warn(
        "[pacing/campaigns] no version row for master",
        master.mba_number,
        master.version_number
      );
      continue;
    }

    const searchRows = await fetchSearchLineItemsForMba({
      mba_number: master.mba_number,
      versionRowId: versionRow.id,
      versionNumber: master.version_number,
    });

    for (const searchRow of searchRows) {
      const lineItemId = String(searchRow.line_item_id ?? searchRow.lineItemId ?? "").trim();
      if (!lineItemId) {
        console.warn("[pacing/campaigns] search row missing line_item_id", master.mba_number, searchRow.id);
        continue;
      }
      inputs.push({ master, versionRow, searchRow });
    }
  }

  return inputs;
}
```

#### `lib/pacing/social/fetchSocialPacingCampaignRows.ts` (lines 1–22, 96–120)

```typescript
import "server-only";

import type { DateWindows } from "@/lib/pacing/campaigns/aggregate";
import type { KpiTargets } from "@/lib/pacing/campaigns/types";
import { fetchCampaignKpisForMbas } from "@/lib/xano/campaignKpi";
import {
  aggregateSocialForLineItem,
  type SocialFactRow,
} from "@/lib/pacing/social/aggregate";
import {
  resolveLiveSocialPacingCampaignRows,
  type GetLiveSocialLineItemsArgs,
} from "@/lib/pacing/social/resolveLiveSocialLineItems";
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types";
import {
  computePacing,
  getMelbourneYesterdayISO,
  type PacingStatus,
} from "@/lib/pacing/maths";
import { queryPacingFact } from "@/lib/snowflake/pacing-fact";

export type FetchSocialPacingCampaignRowsArgs = GetLiveSocialLineItemsArgs;
```

```typescript
/**
 * Full social pacing composer: resolves live line items, hydrates Snowflake
 * actuals per platform, aggregates to line-item grain, and computes spend pacing.
 */
export async function fetchSocialPacingCampaignRows(
  args: FetchSocialPacingCampaignRowsArgs
): Promise<SocialPacingCampaignRow[]> {
  const rows = await resolveLiveSocialPacingCampaignRows(args);
  if (rows.length === 0) return rows;

  const metaIds = Array.from(
    new Set(
      rows.filter((r) => r.socialPlatform === "meta").map((r) => r.lineItemId.toLowerCase())
    )
  );
  const tiktokIds = Array.from(
    new Set(
      rows.filter((r) => r.socialPlatform === "tiktok").map((r) => r.lineItemId.toLowerCase())
    )
  );

  const lineTotalStart =
    rows
      .map((r) => r.lineItemStartDate)
      .filter((d): d is string => !!d)
      .sort()[0] ?? args.asOfDate;
  const yesterday = getMelbourneYesterdayISO(args.asOfDate);

  if (metaIds.length > 0 || tiktokIds.length > 0) {
```

#### `lib/pacing/social/resolveLiveSocialLineItems.ts` — `allowedClientSlugs` filter (lines 19–158)

Social uses the same master-filter pattern as search (filter happens in `resolveLiveSocialLineItemInputs`, called by `resolveLiveSocialPacingCampaignRows`):

```typescript
export type GetLiveSocialLineItemsArgs = {
  asOfDate: string;
  allowedClientSlugs: Set<string> | null;
};

export type LiveSocialLineItemInput = {
  master: MediaPlanMaster;
  versionRow: VersionRow;
  socialRow: Record<string, unknown>;
};
```

```typescript
/**
 * Resolves live social line items (masters, versions, Xano social rows)
 * without Snowflake hydration.
 */
export async function resolveLiveSocialLineItemInputs(
  args: GetLiveSocialLineItemsArgs
): Promise<LiveSocialLineItemInput[]> {
  const masters = await fetchAllMasters();
  const liveMasters = masters.filter((m) => {
    if (!isLiveCampaignStatus(m.campaign_status)) return false;
    if (!m.campaign_start_date || !m.campaign_end_date) return false;
    if (args.asOfDate < m.campaign_start_date || args.asOfDate > m.campaign_end_date) return false;
    if (args.allowedClientSlugs !== null) {
      const slug = slugifyPlanClientName(m.mp_client_name);
      if (!slug || !args.allowedClientSlugs.has(slug)) return false;
    }
    return true;
  });

  if (liveMasters.length === 0) return [];

  const versionRowsByMba = await fetchCurrentVersionRowsForMasters(liveMasters);
  const inputs: LiveSocialLineItemInput[] = [];

  for (const master of liveMasters) {
    const versionRow = versionRowsByMba.get(norm(master.mba_number));
    if (!versionRow) {
      console.warn(
        "[pacing/social] no version row for master",
        master.mba_number,
        master.version_number
      );
      continue;
    }

    const socialRows = await fetchSocialLineItemsForMba({
      mba_number: master.mba_number,
      versionRowId: versionRow.id,
      versionNumber: master.version_number,
```

**`allowedClientSlugs` behaviour (both channels):** When non-null, masters are filtered by `slugifyPlanClientName(m.mp_client_name)` membership in the set. When null, all live in-date masters pass. Empty set → zero masters → empty rows (tenant with no resolved client IDs).

---

### 3. `app/api/pacing/admin/orphans/` — files, HTTP methods, mutations

| File | HTTP methods | Mutations |
|------|--------------|-----------|
| `app/api/pacing/admin/orphans/route.ts` | **GET** | Read-only — queries Snowflake via `getOrphanAdGroups` (no Xano/Snowflake writes) |
| `app/api/pacing/admin/orphans/assign/route.ts` | **POST** | **Snowflake** `ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT` — `UPDATE … SET LINE_ITEM_ID = ? WHERE CHANNEL = ? AND PLATFORM_LINE_ITEM_ID = ?`. **Xano** `pacing_orphan_fixes` — `POST` audit row (`admin_user_email`, `channel`, `platform_line_item_id`, `previous_line_item_id`, `new_line_item_id`, `ad_group_name`, `campaign_name`, `note`). Also calls `invalidateSearchCampaignsPacingCache()`. |
| `app/api/pacing/admin/orphans/live-line-items/route.ts` | **GET** | Read-only — `getLiveSearchLineItemRecords({ asOfDate, allowedClientSlugs: null })` |

#### `app/api/pacing/admin/orphans/route.ts` (full)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireRole";
import { getOrphanAdGroups, SEARCH_PACING_CHANNELS } from "@/lib/pacing/admin/orphanDetection";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("response" in admin) return admin.response;

  const url = new URL(request.url);
  const dateWindowDays = Number(url.searchParams.get("dateWindow") ?? 30);
  const spendThreshold = Number(url.searchParams.get("spendThreshold") ?? 0);
  const channelParam = url.searchParams.get("channel");

  const channelFilter =
    channelParam && (SEARCH_PACING_CHANNELS as readonly string[]).includes(channelParam)
      ? (channelParam as (typeof SEARCH_PACING_CHANNELS)[number])
      : null;

  const asOfDate = new Date().toISOString().slice(0, 10);

  try {
    const orphans = await getOrphanAdGroups({
      asOfDate,
      dateWindowDays: Number.isFinite(dateWindowDays) ? dateWindowDays : 30,
      channelFilter,
      spendThreshold: Number.isFinite(spendThreshold) ? spendThreshold : 0,
    });
    return NextResponse.json({ orphans, asOfDate, dateWindow: dateWindowDays });
  } catch (err) {
    console.error("[api/pacing/admin/orphans] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
```

#### `app/api/pacing/admin/orphans/assign/route.ts` (full)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireRole";
import {
  assignOrphanLineItem,
  OrphanAssignValidationError,
} from "@/lib/pacing/admin/assignOrphanLineItem";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = {
  channel?: string;
  platformLineItemId?: string;
  lineItemId?: string;
  adGroupName?: string;
  campaignName?: string;
  note?: string;
};

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("response" in admin) return admin.response;

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.channel || !body.platformLineItemId || !body.lineItemId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const adminEmail =
    admin.session?.user?.email ?? admin.session?.user?.sub ?? "unknown";

  try {
    const result = await assignOrphanLineItem({
      adminEmail,
      channel: body.channel,
      platformLineItemId: body.platformLineItemId,
      newLineItemId: body.lineItemId,
      note: body.note,
      adGroupName: body.adGroupName,
      campaignName: body.campaignName,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrphanAssignValidationError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    console.error("[api/pacing/admin/orphans/assign] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
```

#### `app/api/pacing/admin/orphans/live-line-items/route.ts` (full)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireRole";
import { getLiveSearchLineItemRecords } from "@/lib/pacing/campaigns/liveSearchLineItems";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("response" in admin) return admin.response;

  const asOfDate = new Date().toISOString().slice(0, 10);

  try {
    const lineItems = await getLiveSearchLineItemRecords({
      asOfDate,
      allowedClientSlugs: null,
    });
    return NextResponse.json({ lineItems, asOfDate });
  } catch (err) {
    console.error("[api/pacing/admin/orphans/live-line-items] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
```

**Invalidation tags to consider:** `pacing_orphan_fix` (Xano audit), `search_pacing_fact` / Snowflake LINE_ITEM_ID remap (already invalidates `invalidateSearchCampaignsPacingCache()`).

---

### 4. Pacing campaign route handlers (full)

#### `app/api/pacing/campaigns/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { fetchSearchPacingCampaignRows } from "@/lib/pacing/campaigns/fetchSearchPacingCampaignRows";
import { getAsOfDate } from "@/lib/pacing/maths";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/pacing/campaigns
 *
 * Returns the list of live Search line items composed from Xano.
 * Snowflake-sourced spend/KPI fields and three-level hierarchy populated in Part 2.
 *
 * Query params:
 *   asOfDate? — YYYY-MM-DD, defaults to Melbourne timezone today
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const asOfDateParam = url.searchParams.get("asOfDate");
  const asOfDate = asOfDateParam?.trim() || getAsOfDate();

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds));

  try {
    const rows = await fetchSearchPacingCampaignRows({ asOfDate, allowedClientSlugs });
    return NextResponse.json({ asOfDate, rows });
  } catch (err) {
    console.error("[api/pacing/campaigns] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
```

#### `app/api/pacing/social-campaigns/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requirePacingAccess } from "@/lib/pacing/pacingAuth";
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs";
import { fetchSocialPacingCampaignRows } from "@/lib/pacing/social/fetchSocialPacingCampaignRows";
import { getAsOfDate } from "@/lib/pacing/maths";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/pacing/social-campaigns
 *
 * Returns the list of live Social line items composed from Xano.
 * Snowflake-sourced spend/KPI fields and three-level hierarchy populated in Part 2.
 *
 * Query params:
 *   asOfDate? — YYYY-MM-DD, defaults to Melbourne timezone today
 */
export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const asOfDateParam = url.searchParams.get("asOfDate");
  const asOfDate = asOfDateParam?.trim() || getAsOfDate();

  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds));

  try {
    const rows = await fetchSocialPacingCampaignRows({ asOfDate, allowedClientSlugs });
    return NextResponse.json({ asOfDate, rows });
  } catch (err) {
    console.error("[api/pacing/social-campaigns] failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
```

**Cache key dimensions:** `asOfDate`, tenant scope (`allowedClientSlugs` set or `null`), channel (`search` vs `social`).

---

## P2 — Trimmed switch verification

### 5. `Select-String` for `GET /api/mediaplans` consumers

```powershell
Select-String -Path "app\**\*.ts","app\**\*.tsx","components\**\*.tsx","lib\**\*.ts" -Pattern "/api/mediaplans" | Where-Object { $_.Line -notmatch "/api/mediaplans/mba" }
```

**Output:**

```
app\mediaplans\page.tsx:146:        const response = await fetch("/api/mediaplans");
components\finance\MediaPlanActionBar.tsx:195:                
`/api/mediaplans/versions/${mp.versionId}/billing-schedule`,
```

**Note:** `MediaPlanActionBar.tsx` matches the substring `/api/mediaplans` but calls **`PATCH /api/mediaplans/versions/{id}/billing-schedule`**, not `GET /api/mediaplans`. The **only** consumer of `GET /api/mediaplans` is `app/mediaplans/page.tsx`.

#### Other consuming files

None (besides `app/mediaplans/page.tsx`).

#### `app/mediaplans/page.tsx` — GET response consumption (lines 141–248)

```typescript
  // Fetch media plans from the API
  useEffect(() => {
    const fetchMediaPlans = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/mediaplans");
        if (!response.ok) {
          throw new Error("Failed to fetch media plans");
        }
        const data = await response.json();
        console.log("Fetched media plans data:", data);
  
        // Handle both MediaPlanMaster and MediaPlanVersions data structures
        const mediaPlansData = Array.isArray(data) ? data : [data];
        console.log("Processed media plans data:", mediaPlansData);
        
        // Debug: Log media type flags for first plan
        if (mediaPlansData.length > 0) {
          console.log("First plan media type flags:", {
            mp_television: mediaPlansData[0].mp_television,
            mp_radio: mediaPlansData[0].mp_radio,
            mp_newspaper: mediaPlansData[0].mp_newspaper,
            mp_magazines: mediaPlansData[0].mp_magazines,
            mp_ooh: mediaPlansData[0].mp_ooh,
            mp_cinema: mediaPlansData[0].mp_cinema,
            mp_digidisplay: mediaPlansData[0].mp_digidisplay,
            mp_digiaudio: mediaPlansData[0].mp_digiaudio,
            mp_digivideo: mediaPlansData[0].mp_digivideo,
            mp_bvod: mediaPlansData[0].mp_bvod,
            mp_integration: mediaPlansData[0].mp_integration,
            mp_search: mediaPlansData[0].mp_search,
            mp_socialmedia: mediaPlansData[0].mp_socialmedia,
            mp_progdisplay: mediaPlansData[0].mp_progdisplay,
            mp_progvideo: mediaPlansData[0].mp_progvideo,
            mp_progbvod: mediaPlansData[0].mp_progbvod,
            mp_progaudio: mediaPlansData[0].mp_progaudio,
            mp_progooh: mediaPlansData[0].mp_progooh,
            mp_influencers: mediaPlansData[0].mp_influencers,
          });
        }

        // Helper function to normalize boolean values from API
        const normalizeBoolean = (value: any): boolean => {
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
          }
          if (typeof value === 'number') return value === 1;
          return false;
        };

        // Process campaigns to handle completed status based on end date
        const processedPlans = mediaPlansData.map(plan => {
          const today = new Date();
          const endDate = new Date(plan.campaign_end_date || plan.campaign_end_date);
          
          // Normalize all media type boolean flags
          const normalizedPlan = {
            ...plan,
            mp_television: normalizeBoolean(plan.mp_television),
            mp_radio: normalizeBoolean(plan.mp_radio),
            mp_newspaper: normalizeBoolean(plan.mp_newspaper),
            mp_magazines: normalizeBoolean(plan.mp_magazines),
            mp_ooh: normalizeBoolean(plan.mp_ooh),
            mp_cinema: normalizeBoolean(plan.mp_cinema),
            mp_digidisplay: normalizeBoolean(plan.mp_digidisplay),
            mp_digiaudio: normalizeBoolean(plan.mp_digiaudio),
            mp_digivideo: normalizeBoolean(plan.mp_digivideo),
            mp_bvod: normalizeBoolean(plan.mp_bvod),
            mp_integration: normalizeBoolean(plan.mp_integration),
            mp_search: normalizeBoolean(plan.mp_search),
            mp_socialmedia: normalizeBoolean(plan.mp_socialmedia),
            mp_progdisplay: normalizeBoolean(plan.mp_progdisplay),
            mp_progvideo: normalizeBoolean(plan.mp_progvideo),
            mp_progbvod: normalizeBoolean(plan.mp_progbvod),
            mp_progaudio: normalizeBoolean(plan.mp_progaudio),
            mp_progooh: normalizeBoolean(plan.mp_progooh),
            mp_influencers: normalizeBoolean(plan.mp_influencers),
          };
          
          // If campaign end date is in the past and status is not cancelled, mark as completed
          if (endDate < today && plan.campaign_status.toLowerCase() !== 'cancelled') {
            return {
              ...normalizedPlan,
              campaign_status: 'Completed'
            };
          }
          
          // Capitalize first letter of status
          return {
            ...normalizedPlan,
            campaign_status: plan.campaign_status.charAt(0).toUpperCase() + plan.campaign_status.slice(1)
          };
        });

        console.log("Final processed plans:", processedPlans);
        setMediaPlans(processedPlans as MediaPlan[]);
        setFilteredPlans(processedPlans as MediaPlan[]);
      } catch (err) {
        console.error("Error fetching media plans:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };
  
    fetchMediaPlans();
  }, []);
```

**Field dependencies used in UI:** `id`, `mp_client_name`, `mba_number`, `mp_campaignname` / `campaign_name`, `version_number`, `campaign_status`, `campaign_start_date`, `campaign_end_date`, `mp_campaignbudget`, `brand` (search filter), all `mp_*` media flags. Spread `...plan` retains any extra API fields but they are not read explicitly.

---

### 6. `app/mediaplans/page.tsx` — fields **NOT** in trimmed set

**Trimmed set:** `id`, `version_number`, `created_at`, `mba_number`, `mp_client_name`, `campaign_name`, `campaign_status`, `campaign_start_date`, `campaign_end_date`, `mp_campaignbudget`, `brand`, `mp_television` … `mp_influencers`.

#### Interface fields outside trimmed set (declared but mostly unused)

```typescript
interface MediaPlan {
  id: number;
  // Use standardized field name
  mp_client_name: string;
  mba_number: string;
  mp_campaignname?: string;
  campaign_name?: string;
  version_number: number;
  campaign_status: string;
  campaign_start_date: string;
  campaign_end_date: string;
  mp_campaignbudget: number;
  created_at: number;
  // Media type flags (these will come from the latest version)
  mp_television?: boolean;
  // ... mp_* flags ...
  // Additional fields that might be present
  brand?: string;
  client_contact?: string;
  po_number?: string;
  fixed_fee?: boolean;
}
```

#### Runtime references to fields **outside** trimmed set

**`mp_campaignname`** — used throughout (not in trimmed set; `campaign_name` is):

```typescript
    campaign: plan => plan.mp_campaignname || plan.campaign_name || "",
```

```typescript
                                  mp_campaignname: plan.mp_campaignname || plan.campaign_name || "",
```

```typescript
                                  <TableCell className="w-40">{plan.mp_campaignname || plan.campaign_name}</TableCell>
```

**`client_contact`, `po_number`, `fixed_fee`** — declared on `MediaPlan` interface only; **no runtime reads** in this file.

**`created_at`** — declared on interface; **no runtime reads** in this file.

**Conclusion for trimmed endpoint:** Safe to omit `client_contact`, `po_number`, `fixed_fee`, `created_at`. Must alias or include `mp_campaignname` **or** ensure consumers use `campaign_name` only (page currently reads both).

---

## P4 — Dashboard schedule usage

### 7. `components/dashboard/DashboardOverview.tsx` — `billingSchedule` / `deliverySchedule`

#### `Select-String` output

```powershell
Select-String -Path "components\dashboard\DashboardOverview.tsx" -Pattern "billingSchedule|deliverySchedule"
```

```
components\dashboard\DashboardOverview.tsx:100:  billingSchedule?: any
components\dashboard\DashboardOverview.tsx:101:  deliverySchedule?: any
components\dashboard\DashboardOverview.tsx:265:const billingScheduleMatchesMonth = (schedule: any, monthFilter: string | null): boolean => {
components\dashboard\DashboardOverview.tsx:582:const parseBillingScheduleAmount = (amountStr: string | number): number => {
components\dashboard\DashboardOverview.tsx:646:  const schedule = plan.deliverySchedule ?? plan.billingSchedule
components\dashboard\DashboardOverview.tsx:677:    const schedule = plan.deliverySchedule ?? plan.billingSchedule
components\dashboard\DashboardOverview.tsx:678:    if (!billingScheduleMatchesMonth(schedule, filters.month)) return false
components\dashboard\DashboardOverview.tsx:722:              const amount = parseBillingScheduleAmount(lineItem.amount)
components\dashboard\DashboardOverview.tsx:740:    let billingSchedule = item.billingSchedule
components\dashboard\DashboardOverview.tsx:741:    let deliverySchedule = item.deliverySchedule
components\dashboard\DashboardOverview.tsx:742:    if (billingSchedule && typeof billingSchedule === "string") {
components\dashboard\DashboardOverview.tsx:744:        billingSchedule = JSON.parse(billingSchedule)
components\dashboard\DashboardOverview.tsx:746:        billingSchedule = null
components\dashboard\DashboardOverview.tsx:749:    if (deliverySchedule && typeof deliverySchedule === "string") {
components\dashboard\DashboardOverview.tsx:751:        deliverySchedule = JSON.parse(deliverySchedule)
components\dashboard\DashboardOverview.tsx:753:        deliverySchedule = null
components\dashboard\DashboardOverview.tsx:787:      billingSchedule: billingSchedule || undefined,
components\dashboard\DashboardOverview.tsx:788:      deliverySchedule: deliverySchedule || undefined,
components\dashboard\DashboardOverview.tsx:1618:        const schedule = campaign.deliverySchedule ?? campaign.billingSchedule
components\dashboard\DashboardOverview.tsx:1630:        const schedule = campaign.deliverySchedule ?? campaign.billingSchedule
```

#### MediaPlan interface (schedule fields on dashboard model)

```typescript
  billingSchedule?: any
  deliverySchedule?: any
```

#### `billingScheduleMatchesMonth` — month filter

```typescript
const billingScheduleMatchesMonth = (schedule: any, monthFilter: string | null): boolean => {
  if (!monthFilter || !String(monthFilter).trim()) return true

  const target = normalizeMonthKeyForMatch(monthFilter)
  if (!target) return true

  let scheduleArray: any[] = []
  if (Array.isArray(schedule)) {
    scheduleArray = schedule
  } else if (schedule?.months && Array.isArray(schedule.months)) {
    scheduleArray = schedule.months
  } else {
    return false
  }

  return scheduleArray.some((entry: any) => {
    const my = entry?.monthYear
    if (!my || typeof my !== "string") return false
    return normalizeMonthKeyForMatch(my) === target
  })
}
```

#### `parseBillingScheduleAmount` + `extractPublishersFromSchedule` + publisher filter

```typescript
const parseBillingScheduleAmount = (amountStr: string | number): number => {
  if (typeof amountStr === "number") return amountStr
  if (!amountStr || typeof amountStr !== "string") return 0
  const cleaned = amountStr.replace(/[$,]/g, "").trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}
```

```typescript
const extractPublishersFromSchedule = (schedule: any): Set<string> => {
  const publishers = new Set<string>()
  if (!schedule) return publishers

  let scheduleArray: any[] = []
  if (Array.isArray(schedule)) {
    scheduleArray = schedule
  } else if (schedule.months && Array.isArray(schedule.months)) {
    scheduleArray = schedule.months
  } else {
    return publishers
  }

  scheduleArray.forEach((entry: any) => {
    if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
      entry.mediaTypes.forEach((mediaType: any) => {
        if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
          mediaType.lineItems.forEach((lineItem: any) => {
            if (lineItem.header1 && lineItem.header1.trim() !== "") {
              publishers.add(lineItem.header1.trim())
            }
          })
        }
      })
    }
  })

  return publishers
}

const planHasAnyPublisher = (plan: MediaPlan, publishers: string[]): boolean => {
  if (!publishers.length) return true
  const schedule = plan.deliverySchedule ?? plan.billingSchedule
  const pubSet = extractPublishersFromSchedule(schedule)
  return publishers.some((p) => pubSet.has(p))
}
```

#### Table filters — month + publisher (uses schedule)

```typescript
    if (!planHasAnyPublisher(plan, filters.publishers)) return false

    const schedule = plan.deliverySchedule ?? plan.billingSchedule
    if (!billingScheduleMatchesMonth(schedule, filters.month)) return false
```

#### `extractSpendFromSchedule` — FY spend derivation (used in `fetchData` metrics)

```typescript
const extractSpendFromSchedule = (schedule: any, fyStartDate: Date, fyEndDate: Date): { publisherSpend: Record<string, number>; totalSpend: number } => {
  const publisherSpend: Record<string, number> = {}
  let totalSpend = 0
  if (!schedule) return { publisherSpend, totalSpend }

  let scheduleArray: any[] = []
  if (Array.isArray(schedule)) {
    scheduleArray = schedule
  } else if (schedule.months && Array.isArray(schedule.months)) {
    scheduleArray = schedule.months
  } else {
    return { publisherSpend, totalSpend }
  }

  scheduleArray.forEach((entry: any) => {
    const monthDate = parseMonthYear(entry.monthYear)
    if (!monthDate) return

    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

    if (monthStart <= fyEndDate && monthEnd >= fyStartDate) {
      if (entry.mediaTypes && Array.isArray(entry.mediaTypes)) {
        entry.mediaTypes.forEach((mediaType: any) => {
          if (mediaType.lineItems && Array.isArray(mediaType.lineItems)) {
            mediaType.lineItems.forEach((lineItem: any) => {
              const amount = parseBillingScheduleAmount(lineItem.amount)
              if (amount > 0 && lineItem.header1 && lineItem.header1.trim() !== "") {
                const publisher = lineItem.header1.trim()
                publisherSpend[publisher] = (publisherSpend[publisher] || 0) + amount
                totalSpend += amount
              }
            })
          }
        })
      }
    }
  })

  return { publisherSpend, totalSpend }
}
```

#### `transformMediaPlanData` — parse schedules from `/api/media_plans` response

```typescript
const transformMediaPlanData = (apiData: any[]): MediaPlan[] =>
  apiData.map((item: any) => {
    let billingSchedule = item.billingSchedule
    let deliverySchedule = item.deliverySchedule
    if (billingSchedule && typeof billingSchedule === "string") {
      try {
        billingSchedule = JSON.parse(billingSchedule)
      } catch {
        billingSchedule = null
      }
    }
    if (deliverySchedule && typeof deliverySchedule === "string") {
      try {
        deliverySchedule = JSON.parse(deliverySchedule)
      } catch {
        deliverySchedule = null
      }
    }

    return {
      id: item.id || 0,
      mp_clientname: item.mp_client_name || item.mp_clientname || "",
      mp_campaignname: item.campaign_name || item.mp_campaignname || "",
      mp_mba_number: item.mba_number || item.mp_mba_number || "",
      mp_version: item.version_number || item.mp_version || 1,
      mp_brand: item.brand || "",
      mp_campaignstatus: item.campaign_status || item.mp_campaignstatus || "",
      mp_campaigndates_start: item.campaign_start_date || item.mp_campaigndates_start || "",
      mp_campaigndates_end: item.campaign_end_date || item.mp_campaigndates_end || "",
      mp_campaignbudget: item.mp_campaignbudget || 0,
      mp_television: item.mp_television || false,
      mp_radio: item.mp_radio || false,
      mp_newspaper: item.mp_newspaper || false,
      mp_magazines: item.mp_magazines || false,
      mp_ooh: item.mp_ooh || false,
      mp_cinema: item.mp_cinema || false,
      mp_digidisplay: item.mp_digidisplay || false,
      mp_digiaudio: item.mp_digiaudio || false,
      mp_digivideo: item.mp_digivideo || false,
      mp_bvod: item.mp_bvod || false,
      mp_integration: item.mp_integration || false,
      mp_search: item.mp_search || false,
      mp_socialmedia: item.mp_socialmedia || false,
      mp_progdisplay: item.mp_progdisplay || false,
      mp_progvideo: item.mp_progvideo || false,
      mp_progbvod: item.mp_progbvod || false,
      mp_progaudio: item.mp_progaudio || false,
      mp_progooh: item.mp_progooh || false,
      mp_influencers: item.mp_influencers || false,
      billingSchedule: billingSchedule || undefined,
      deliverySchedule: deliverySchedule || undefined,
    }
  })
```

#### `fetchData` — live-publisher count + FY publisher/client spend metrics

```typescript
      const allPublishersSet = new Set<string>()
      for (const campaign of liveCampaigns) {
        const schedule = campaign.deliverySchedule ?? campaign.billingSchedule
        if (schedule) {
          const publishers = extractPublishersFromSchedule(schedule)
          publishers.forEach((publisher) => allPublishersSet.add(publisher))
        }
      }
      const totalLivePublishers = allPublishersSet.size

      const publisherSpend: Record<string, number> = {}
      const clientSpend: Record<string, number> = {}

      for (const campaign of eligibleCampaignsInFY) {
        const schedule = campaign.deliverySchedule ?? campaign.billingSchedule
        if (schedule) {
          try {
            const { publisherSpend: campaignPublisherSpend, totalSpend: campaignTotalSpend } = extractSpendFromSchedule(schedule, fyStartDate, fyEndDate)

            Object.entries(campaignPublisherSpend).forEach(([publisher, amount]) => {
              publisherSpend[publisher] = (publisherSpend[publisher] || 0) + amount
            })

            if (campaign.mp_clientname && campaignTotalSpend > 0) {
              clientSpend[campaign.mp_clientname] = (clientSpend[campaign.mp_clientname] || 0) + campaignTotalSpend
            }
          } catch (error) {
            console.error(`Error processing billing schedule for campaign ${campaign.mp_mba_number}:`, error)
          }
        }
      }
```

**Schedule precedence:** `deliverySchedule ?? billingSchedule` everywhere.

**Schedule shape expected:** array of `{ monthYear, mediaTypes: [{ lineItems: [{ header1, amount }] }] }` or `{ months: [...] }`.

**Dashboard data source:** `GET /api/media_plans` (not `/api/mediaplans`). Schedules are required for: month filter, publisher filter, Total Live Publishers metric, publisher/client FY spend pie charts. Global monthly spend routes (`/api/dashboard/global-monthly-publisher-spend`, `/api/dashboard/global-monthly-client-spend`) are fetched separately in `fetchData` and do not use per-plan schedules in the client.
