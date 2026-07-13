# DISCOVERY — Creative Delivery & Mockup Feature

**Date:** 2026-07-09  
**Scope:** Read-only codebase discovery for upload/storage, routing, auth, and media UI reuse.  
**Repo:** `C:\Projects\avmediaplan`

---

## Executive summary

Creative delivery / mockup is **not implemented** today (no routes, types, or APIs named `creative_asset`, `mockup`, or `creative-delivery`). File handling is **not greenfield**: the app already uploads plan documents to **Xano** via a Next.js API proxy using **multipart `FormData`**, stores **Public File metadata** on `media_plan_versions`, and downloads files from Xano-hosted URLs. There is **no** direct `@vercel/blob`, `@aws-sdk`, `sharp`, or `uploadthing` dependency in `package.json`, and **no** presigned-URL upload path in application code.

**Stop conditions triggered** — see [Open questions](#open-questions-stop-conditions).

---

## 1. Existing file upload / storage code

### 1.1 PowerShell search results

Command run:

```powershell
Get-ChildItem -Recurse -Include *.ts,*.tsx -Path app,lib,components | Select-String -Pattern "upload|presigned|putObject|blob|S3|formData" -List
```

**Files with at least one match** (grouped by relevance):

| Category | Files |
|----------|-------|
| **Real upload / file I/O** | `app/api/mediaplans/versions/[id]/documents/route.ts`, `app/api/processPlan/route.ts`, `lib/api.ts` (`uploadMediaPlanVersionDocuments`) |
| **Client/server Blob (download/export, not storage)** | `app/api/campaigns/[mba_number]/billing-schedule/route.ts`, `app/dashboard/.../CampaignActions.tsx`, `app/finance/FinanceHubPageClient.tsx`, `lib/billing/exportBillingScheduleExcel.ts`, `lib/finance/*.ts`, `lib/generate*.ts`, `components/charts/system/chart-shell.tsx`, `components/client-hub/ClientFinanceExcelExportDialog.tsx`, `components/finance/**` |
| **formData (forms / React Hook Form, not uploads)** | `app/scopes-of-work/create/page.tsx`, `app/scopes-of-work/[id]/edit/page.tsx`, `components/EditClientForm.tsx` |
| **Incidental** | `lib/mediaplan/expertGridPaste.ts` (clipboard `getType`), `lib/pacing/social/resolveLiveSocialLineItems.ts` (comment “S3b”), `lib/utils/csv-export.ts`, `components/ui/icons/index.tsx` (`Upload` icon), `components/ui/saving-modal.tsx` (Vercel Blob **URL** for GIF), `app/mediaplans/create/page.tsx`, `app/mediaplans/mba/[mba_number]/edit/page.tsx` |

**Confidence:** 95% that the only **persistent file upload** paths are Xano document upload + ephemeral `processPlan` parsing.

---

### 1.2 Primary upload path — Xano multipart via Next API

**Client helper** — builds `FormData`, POSTs to internal API:

```54:77:c:\Projects\avmediaplan\lib\api.ts
export async function uploadMediaPlanVersionDocuments(
  versionId: number,
  files: { mediaPlan?: File; mbaPdf?: File; aaMediaPlan?: File; mpClientName?: string }
) {
  const formData = new FormData()
  if (files.mediaPlan) formData.append("media_plan", files.mediaPlan, files.mediaPlan.name)
  if (files.mbaPdf) formData.append("mba_pdf", files.mbaPdf, files.mbaPdf.name)
  if (files.aaMediaPlan) formData.append("aa_media_plan", files.aaMediaPlan, files.aaMediaPlan.name)
  if (typeof files.mpClientName === "string" && files.mpClientName.trim()) {
    formData.append("mp_client_name", files.mpClientName.trim())
  }

  const response = await fetch(`/api/mediaplans/versions/${versionId}/documents`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const message = await extractResponseMessage(response)
    throw new Error(message || "Failed to upload documents")
  }

  return parseJsonOrText(response)
}
```

**Confidence:** 98%

**Server route** — receives multipart, uploads to Xano `upload_mediaplan` / `upload_mba`, PATCHes `media_plan_versions` with Public File metadata:

```11:28:c:\Projects\avmediaplan\app\api\mediaplans\versions\[id]\documents\route.ts
type XanoPublicFile = {
  access: "public" | "private" | string
  path: string
  name: string
  type: string
  size: number
  mime: string
  meta: Record<string, any>
}

function isXanoPublicFile(value: any): value is XanoPublicFile {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.path === "string" &&
      typeof value.name === "string" &&
      typeof value.mime === "string"
  )
}
```

```104:130:c:\Projects\avmediaplan\app\api\mediaplans\versions\[id]\documents\route.ts
    const baseUrl = getXanoBaseUrl(["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
    const saveFileBaseUrl = getXanoBaseUrl("XANO_SAVE_FILE_BASE_URL")
    const apiKey = process.env.XANO_API_KEY

    const authHeaders = {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    }

    // Xano-recommended approach:
    // 1) Upload file to a dedicated upload endpoint -> returns Public File metadata
    // 2) PATCH the record with the metadata in the Public File fields
    const uploadAttachment = async (
      endpoint: "upload_mediaplan" | "upload_mba",
      file: FileLike,
      fallbackName: string
    ): Promise<XanoPublicFile> => {
      const form = new FormData()
      const fileName = (file as any).name || fallbackName

      // Per your Swagger for these endpoints: multipart field name is `content`
      form.append("content", file, fileName)
      // Some Xano upload endpoints require an explicit `type` input.
      // Xano’s standard values are: image | video | audio, with attachment as the default/elsewhere.
      // Your endpoint is for saving plan documents, so attachment is the correct choice.
      form.append("type", "attachment")
      // Some custom upload endpoints also require `access` (public/private).
      form.append("access", "public")
```

```198:216:c:\Projects\avmediaplan\app\api\mediaplans\versions\[id]\documents\route.ts
    if (wantsMediaPlan) {
      patch.media_plan = await uploadAttachment("upload_mediaplan", mediaPlan, "media_plan.xlsx")
    }
    if (wantsMbaPdf) {
      patch.mba_pdf = await uploadAttachment("upload_mba", mbaPdf, "mba.pdf")
    }
    if (wantsAaMediaPlan) {
      patch.aa_media_plan = await uploadAttachment("upload_mediaplan", aaMediaPlan, "aa_media_plan.xlsx")
    }

    const patchRes = await fetch(`${baseUrl}/media_plan_versions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(patch),
    })
```

**Call sites:** `app/mediaplans/create/page.tsx`, `app/mediaplans/mba/[mba_number]/edit/page.tsx` (via `uploadMediaPlanVersionDocuments`).

**Confidence:** 98%

---

### 1.3 Ephemeral upload — plan file parsing (not stored)

```8:34:c:\Projects\avmediaplan\app\api\processPlan\route.ts
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const fileEntries: File[] = []

    // Accept either a single "file" field or multiple "files" entries
    const possibleKeys = ["file", "files"]
    for (const key of possibleKeys) {
      const entries = formData.getAll(key)
      for (const entry of entries) {
        if (entry instanceof File) fileEntries.push(entry)
      }
    }

    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 })
    }

    const buffers = await Promise.all(
      fileEntries.map(async (file) => ({
        fileName: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    )

    const result = await processPlanFiles(buffers)
    return NextResponse.json(result)
```

**Confidence:** 95% — parses in memory for AI/plan import; no storage write found in this route.

---

### 1.4 File download from Xano Public File metadata

```7:24:c:\Projects\avmediaplan\lib\finance\resolveRelevantVersionAaMediaPlan.ts
function resolveXanoFileOrigin(): string | null {
  const keys = ["XANO_SAVE_FILE_BASE_URL", "XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
  for (const k of keys) {
    const v = process.env[k]
    if (v?.trim()) return v.replace(/\/$/, "")
  }
  return null
}

function buildPublicFileDownloadUrl(meta: Record<string, unknown>, fileOrigin: string): string | null {
  const directUrl = typeof meta.url === "string" && meta.url.trim() ? meta.url.trim() : null
  const path = typeof meta.path === "string" && meta.path.trim() ? meta.path.trim() : null
  if (directUrl) return directUrl
  if (path && fileOrigin) {
    return `${fileOrigin}${path.startsWith("/") ? "" : "/"}${path}`
  }
  return null
}
```

Proxied download example: `app/api/finance/receivables/aa-media-plan/route.ts` fetches upstream URL and streams bytes to client.

**Confidence:** 90%

---

### 1.5 No presigned / S3 / Vercel Blob upload in app code

Searched `presigned`, `putObject`, `@vercel/blob`, `@aws-sdk`, `client-s3` across `*.ts` / `*.tsx` — **no application imports or upload logic**.

**Confidence:** 97%

---

### 1.6 External Vercel Blob URL (display only, not app upload)

```110:116:c:\Projects\avmediaplan\components\ui\saving-modal.tsx
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Data%20Sophistication-qgeiUdEIVkx6q4ceYsDFi1w38pwqjv.gif"
              alt="Saving..."
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16"
```

**Confidence:** 99% — hardcoded CDN URL; no `@vercel/blob` SDK usage.

---

## 2. Storage-related dependencies and env vars

### 2.1 `package.json` dependencies

Direct `dependencies` in `package.json` include **none** of: `@aws-sdk/*`, `@vercel/blob`, `sharp`, `uploadthing`, `@google-cloud/storage`.

Relevant excerpt:

```29:92:c:\Projects\avmediaplan\package.json
  "dependencies": {
    "@anthropic-ai/sdk": "^0.97.1",
    "@auth0/nextjs-auth0": "^4.11.0",
    ...
    "exceljs": "^4.4.0",
    "file-saver": "^2.0.5",
    ...
    "mammoth": "^1.6.0",
    ...
    "pdf-parse": "^1.1.1",
    ...
    "snowflake-sdk": "^2.3.3",
```

`overrides` only pin transitive `@google-cloud/storage` (via `snowflake-sdk`) — not a direct app dependency:

```94:101:c:\Projects\avmediaplan\package.json
  "overrides": {
    "@google-cloud/storage": {
      "fast-xml-parser": "5.5.7"
    },
    "snowflake-sdk": {
      "fast-xml-parser": "5.5.7"
    },
```

`package-lock.json` contains transitive `@aws-sdk/client-s3` (not imported in app `*.ts`/`*.tsx`).

**Confidence:** 98%

---

### 2.2 Environment files

Command:

```powershell
Select-String -Path .env.local,.env.example -Pattern "S3|BLOB|BUCKET|STORAGE|AWS" -ErrorAction SilentlyContinue
```

- **`.env.local`:** not present in repo (no committed local env).
- **`.env.example`:** not found; project uses **`env.local.example`** instead.

`Select-String` on `.env.local` / `.env.example` returned **no matches** (files absent or no pattern hits).

`env.local.example` documents Xano URLs but **not** `XANO_SAVE_FILE_BASE_URL`, `S3`, `BLOB`, `BUCKET`, `STORAGE`, or `AWS`:

```16:22:c:\Projects\avmediaplan\env.local.example
XANO_MEDIA_PLANS_BASE_URL=https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa
XANO_MEDIAPLANS_BASE_URL=https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM
XANO_CLIENTS_BASE_URL=https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8
XANO_PUBLISHERS_BASE_URL=REPLACE_WITH_XANO_PUBLISHERS_BASE_URL
XANO_SCOPES_BASE_URL=REPLACE_WITH_XANO_SCOPES_BASE_URL
XANO_MEDIA_DETAILS_BASE_URL=REPLACE_WITH_XANO_MEDIA_DETAILS_BASE_URL
XANO_MEDIA_CONTAINERS_BASE_URL=REPLACE_WITH_XANO_MEDIA_CONTAINERS_BASE_URL
```

README documents `XANO_SAVE_FILE_BASE_URL`:

```103:107:c:\Projects\avmediaplan\README.md
- `XANO_API_KEY` — Bearer token for secured Xano APIs
- `XANO_MEDIA_PLANS_BASE_URL` / `XANO_MEDIAPLANS_BASE_URL` — media plan master, versions, line items
- `XANO_CLIENTS_BASE_URL` — clients, finance helpers, some pacing alerts
- `XANO_PUBLISHERS_BASE_URL`, `XANO_MEDIA_CONTAINERS_BASE_URL`, `XANO_MEDIA_DETAILS_BASE_URL`
- `XANO_SCOPES_BASE_URL`, `XANO_SAVE_FILE_BASE_URL`
```

**Confidence:** 92%

---

### 2.3 `vercel.json`

```1:8:c:\Projects\avmediaplan\vercel.json
{
  "crons": [
    {
      "path": "/api/cron/xano-line-item-sync",
      "schedule": "0 19 * * *"
    }
  ]
}
```

**No** function memory/duration overrides, **no** body size limits.

**Confidence:** 99%

---

### 2.4 `next.config.mjs`

No `serverActions.bodySizeLimit`, `api.bodyParser`, or upload-related experimental flags:

```1:22:c:\Projects\avmediaplan\next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/finance/billing", destination: "/finance?tab=billing", permanent: true },
      ...
    ]
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Removed deprecated experimental features for Next.js 15
  },
```

**Confidence:** 98% — **no Vercel body-size workaround** found in config.

---

## 3. Xano file field usage

### 3.1 Established Public File convention

The only **upload + metadata** convention in code is `XanoPublicFile` on `media_plan_versions` fields `media_plan`, `mba_pdf`, `aa_media_plan`:

- Upload endpoints: `upload_mediaplan`, `upload_mba` on `XANO_SAVE_FILE_BASE_URL`
- Multipart field: `content`
- Query/body params: `type` (`attachment` | `image` | `video` | `audio` per comments), `access` (`public` | `private`)
- Stored shape: `{ access, path, name, type, size, mime, meta }`

See full route in §1.2.

**Confidence:** 95%

### 3.2 Other Xano “file” / “media” references

Searched `lib/` and `app/api/` for file/attachment patterns in Xano payloads:

| Area | Finding |
|------|---------|
| `media_plan_*` tables | `media_plan_version`, `mba_number`, `line_item_id` — **not** file fields |
| Line item `creative` | Text field on some channel schemas (e.g. `DigitalAudioLineItem.creative` in `lib/api.ts`) — **campaign copy**, not file upload |
| Finance download | Reads `aa_media_plan` Public File object from version row — download only |
| `attachment` in API | `Content-Disposition: attachment` on **generated** PDF/XLSX responses — not Xano file type |

No second Xano file-upload schema (e.g. per-line-item creative assets) exists in this codebase.

**Confidence:** 88% — Xano may have tables/endpoints not yet wired in app.

---

## 4. Where the feature lives — routes & entity IDs

### 4.1 Top-level `app/` route folders

```
(internal), 403, account, admin, api, auth, client, dashboard, finance,
forbidden, knowledge, management, mediaplans, pacing, profile, publishers,
scopes-of-work, support, tools, unauthorized
```

**Confidence:** 100%

### 4.2 MBA & line item routing

| Route | Params | Purpose |
|-------|--------|---------|
| `/mediaplans` | — | Campaign list |
| `/mediaplans/create` | — | Create campaign |
| `/mediaplans/[id]` | `id` | Version-centric detail (numeric version id) |
| `/mediaplans/[id]/edit` | `id` | Edit by version id |
| `/mediaplans/mba/[mba_number]/edit` | `mba_number` | Edit by MBA number |
| `/dashboard/[slug]/[mba_number]` | `slug`, `mba_number` | Client campaign dashboard |
| `/dashboard/[slug]` | `slug` | Client hub slice |
| `/client/[slug]` | `slug` | Admin client hub detail |
| `/pacing/(shell)/search` | — | Pacing campaigns |
| `/pacing/(shell)/overview` | — | Pacing overview |
| `/pacing/(shell)/social` | — | Social pacing |
| `/pacing/(shell)/admin/orphans` | — | Admin orphan tooling |

Sidebar navigation (staff):

```86:94:c:\Projects\avmediaplan\components\AppSidebar.tsx
    { title: "Home", icon: LayoutDashboard, href: "/dashboard", exact: true as const },
    { title: "Campaigns", icon: FileText, href: "/mediaplans", exact: false as const, isActive: isCampaignsNavActive },
    ...
    { title: "Pacing", icon: TrendingUp, href: "/pacing" },
    ...
    { title: "Client hub", icon: Users, href: "/client", exact: true as const },
    ...
    { title: "Create Campaign", icon: PlusCircle, href: "/mediaplans/create", isActive: isCreateCampaignActive },
```

Campaign detail page params:

```18:27:c:\Projects\avmediaplan\app\dashboard\[slug]\[mba_number]\page.tsx
interface CampaignDetailPageProps {
  params: Promise<{
    slug: string
    mba_number: string
  }>
  searchParams?: Promise<{
    version?: string
    startDate?: string
    endDate?: string
  }>
}
```

**Confidence:** 95%

### 4.3 TypeScript ID fields for `creative_asset` linkage

**MBA / master** (`media_plan_master`):

```9:20:c:\Projects\avmediaplan\lib\types\mediaPlanMaster.ts
export interface MediaPlanMaster {
  id: number;
  mba_number: string;
  mp_client_name: string;
  mp_campaignname: string;
  version_number: number;
  campaign_status: string; // raw — normalise via lib/api/dashboard helpers before comparing
  campaign_start_date: string; // YYYY-MM-DD
  campaign_end_date: string; // YYYY-MM-DD
  mp_campaignbudget: number;
  created_at?: number;
}
```

**Version** (minimal ingest type):

```212:217:c:\Projects\avmediaplan\lib\types\financeForecast.ts
export interface FinanceForecastMediaPlanVersionInput {
  id?: string | number | null
  mba_number?: string | null
  version_number?: number | string | null
  media_plan_master_id?: number | string | null
```

**Line item** (canonical fetch shape):

```11:23:c:\Projects\avmediaplan\lib\xano\fetchAllLineItems.ts
export interface XanoLineItem {
  line_item_id: string
  mba_number: string
  line_item_name: string
  platform: string | null
  buy_type: string | null
  fixed_cost_media: boolean
  bursts_json: unknown[]
  source_table: string
  xano_row_id: number
  /** Unix milliseconds (normalized from Xano `created_at`). */
  xano_created_at: number
}
```

**Per-table line item row** (example — all channels share this ID pattern):

```80:97:c:\Projects\avmediaplan\lib\api.ts
interface CinemaLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  ...
  line_item_id: string;
  line_item: number;
```

**Suggested foreign keys for `creative_asset` (inferred, not implemented):**

| Field | Source |
|-------|--------|
| `mba_number` | `MediaPlanMaster.mba_number` |
| `media_plan_master_id` | `MediaPlanMaster.id` |
| `media_plan_version` / `version_number` | version row |
| `line_item_id` | `XanoLineItem.line_item_id` |
| `xano_row_id` | channel table `id` |
| `source_table` | e.g. `media_plan_social` |

**Confidence:** 90% for ID field names (aligned with existing Xano patterns).

---

## 5. Auth and roles

### 5.1 Role model

```3:3:c:\Projects\avmediaplan\lib\rbac.ts
export type UserRole = 'admin' | 'manager' | 'client';
```

**No `super_admin` role** found in codebase.

**Confidence:** 99%

### 5.2 Middleware — session + client tenant (pages)

```42:59:c:\Projects\avmediaplan\middleware.ts
  // API routes (except /api/auth) return JSON on missing auth
  if (isApiRoute) {
    // NOTE: Middleware only enforces authentication for /api routes.
    // Tenant isolation must be enforced in API handlers (recommended),
    // or by introducing a scoped API route structure (e.g. /api/client/*).
    if (!session) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }

    const roles = getUserRoles(session.user);
    const isClient = roles.includes('client');
    const clientSlug = getUserClientIdentifier(session.user);

    if (isClient && !clientSlug) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }

    return continueResponse;
  }
```

Client users restricted to `/dashboard/{theirSlug}/...`:

```87:110:c:\Projects\avmediaplan\middleware.ts
  if (isClient) {
    if (!clientSlug) {
      redirectTarget = '/unauthorized';
      reason = 'client-missing-slug';
    } else if (pathname === '/') {
      redirectTarget = `/dashboard/${clientSlug}`;
      ...
    } else if (pathname.startsWith('/dashboard')) {
      const base = `/dashboard/${clientSlug}`;
      if (pathname === base || pathname.startsWith(`${base}/`)) {
        // allow
      } else {
        redirectTarget = base;
        reason = 'client-cross-tenant-block';
      }
    } else if (pathname === '/knowledge' || pathname.startsWith('/knowledge/') || pathname === '/forbidden' || pathname === '/unauthorized') {
      // allow these pages
    } else {
      redirectTarget = `/dashboard/${clientSlug}`;
      reason = 'client-non-dashboard-redirect';
    }
  }
```

**Confidence:** 98%

### 5.3 Representative patterns

**Admin page guard (client component):**

```33:35:c:\Projects\avmediaplan\components\guards\AdminGuard.tsx
    if (!isAdmin) {
      router.replace("/dashboard");
    }
```

Used by `app/client/layout.tsx` — **Client hub is admin-only**.

**Admin server page guard:**

```11:14:c:\Projects\avmediaplan\app\pacing\(shell)\admin\orphans\page.tsx
  const roles = getUserRoles(session.user);
  if (!roles.includes("admin")) {
    redirect("/unauthorized");
  }
```

**Admin API route:**

```26:28:c:\Projects\avmediaplan\app\api\finance\billing\mark-billed\route.ts
    const roles = getUserRoles(session.user)
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
```

**Client role blocked from staff feature (API):**

```37:42:c:\Projects\avmediaplan\app\api\finance\forecast\route.ts
  const roles = getUserRoles(session.user)
  if (roles.includes("client")) {
    return responseNoStore(
      { error: "forbidden", reason: "client-role", message: "Finance Forecast is not available for client-role users." },
      { status: 403 }
    )
  }
```

**MBA-scoped client access (`checkClientMbaAccess`) — API:**

```14:29:c:\Projects\avmediaplan\lib\auth\checkClientMbaAccess.ts
export async function checkClientMbaAccess(
  request: NextRequest,
  mbaNumber: string
): Promise<ClientMbaAccess> {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorised" }, { status: 401 }),
    }
  }

  const roles = getUserRoles(session.user)
  if (!roles.includes("client")) {
    return { ok: true, isClient: false }
  }
```

Used on GET MBA data:

```723:724:c:\Projects\avmediaplan\app\api\mediaplans\mba\[mba_number]\route.ts
    const access = await checkClientMbaAccess(request, mba_number)
    if (!access.ok) return access.response
```

And KPI read:

```31:32:c:\Projects\avmediaplan\app\api\kpis\campaign\route.ts
    const access = await checkClientMbaAccess(request, mbaNumber)
    if (!access.ok) return access.response
```

**Note:** `checkClientMbaAccess` is **not** applied to `POST /api/mediaplans/versions/[id]/documents` (upload route has no auth helper in handler — relies on middleware session only). **Confidence:** 95%

**Client dashboard page (server):**

```28:36:c:\Projects\avmediaplan\app\dashboard\page.tsx
  // Client users must be redirected to their client dashboard
  if (isClient) {
    if (!clientSlug) {
      console.error("[dashboard] Client user missing client_slug in app_metadata", {
        email: user.email,
        app_metadata: user['app_metadata'],
      })
      redirect("/unauthorized")
    }
```

**Confidence:** 95% overall for auth patterns.

---

## 6. Existing media rendering components

### 6.1 Search: `<video>`, `next/image`, `ReactPlayer`

```powershell
Select-String -Pattern "<video|next/image|ReactPlayer" -Path components -Recurse
```

**Results:**

| Pattern | Files |
|---------|-------|
| `next/image` | `components/AppSidebar.tsx`, `components/dashboard/HeroBanner.tsx`, `components/ui/saving-modal.tsx` |
| `<video` | **None** |
| `ReactPlayer` | **None** |

Also `app/page.tsx` imports `next/image` (landing).

**Confidence:** 99%

### 6.2 Implications for mockup frames

- **No** dedicated video player, file preview, PDF viewer, or iframe embed components found under `components/`.
- Images use standard `next/image` with `images.unoptimized: true` in `next.config.mjs`.
- Creative/mockup UI would be **new components** unless reusing generic `Card` / `Dialog` primitives from `components/ui/`.

**Confidence:** 90%

---

## Open questions (stop conditions)

### Q1 — Upload architecture conflict (STOP)

An existing **Xano multipart upload** path proxies files through Next.js (`/api/mediaplans/versions/[id]/documents` → `XANO_SAVE_FILE_BASE_URL/upload_*`). A **presigned-URL** approach (direct browser → S3/R2/Vercel Blob) would be a **second pattern**.

**Question:** Should creative assets extend the **existing Xano Public File** flow (same metadata schema, possibly `type: image|video`), or introduce a **new object store + presigned URLs**? Product/engineering must choose before schema design.

**Confidence that conflict exists:** 92%

### Q2 — Multiple storage mechanisms (STOP)

| Mechanism | Role in app |
|-----------|-------------|
| **Xano file storage** | Primary — upload + download for plan documents |
| **Vercel Blob CDN** | Hardcoded GIF URL in `saving-modal` only |
| **Transitive AWS S3 / GCS** | `package-lock.json` only; no app imports |

**Question:** Is Xano storage the mandated backend for creative assets, or is multi-store intentional?

**Confidence:** 90%

### Q3 — Client upload auth

Middleware requires session for `/api/*` but **does not** call `checkClientMbaAccess` globally. Document upload route has **no MBA-scoped check** in the handler.

**Question:** For client creative uploads, should every write use `checkClientMbaAccess(request, mba_number)` (and should non-client roles be allowed to upload on behalf of clients)?

**Confidence:** 88%

### Q4 — `super_admin`

User prompt mentioned `super_admin`; codebase only defines `admin | manager | client`.

**Question:** Is `admin` the intended superset, or is `super_admin` an Auth0 claim not yet referenced in code?

**Confidence:** 99% that `super_admin` is absent from code.

---

## Feature greenfield check

Searched `creative delivery`, `mockup`, `creative_asset` — only hits in learning glossary CSV/JSON (`terms.raw.csv`), not application code.

**Confidence:** 97% that Creative Delivery & Mockup is greenfield at the application layer.

---

## Recommended reuse for implementation (informational)

1. **Upload:** Mirror `XanoPublicFile` + two-step upload/patch if staying on Xano; or document why presigned URLs diverge.
2. **Auth:** Reuse `checkClientMbaAccess` for MBA-scoped client uploads; `getUserRoles` + `roles.includes("admin")` for staff-only surfaces.
3. **Routing:** Natural mount points: `/dashboard/[slug]/[mba_number]` (client) and/or `/mediaplans/mba/[mba_number]/edit` (staff).
4. **Entity keys:** `mba_number`, `media_plan_version` / version `id`, `line_item_id`, optional `source_table`.
5. **UI:** New preview/mockup components; `next/image` available for static images only today.
