# Discovery: creative preview cache (CV2)

Status: complete. 0102 authored (not applied) and CV2 built in CV2b; see "Corrections".

## 1. `creative_preview_cache` columns

`db/migrations/0098_ga4_gsc_accounts_and_creative_previews.sql` (applied; marker `0098_ga4_gsc_accounts_and_creative_previews`):

```sql
  CREATE TABLE IF NOT EXISTS public.creative_preview_cache (
    id             bigserial PRIMARY KEY,
    platform       text NOT NULL,
    creative_key   text NOT NULL,
    client_id      bigint REFERENCES public.clients(id),
    blob_pathname  text,
    mime_type      text,
    width          integer,
    height         integer,
    source         text NOT NULL,
    source_ref     text,
    fetched_at     timestamptz,
    expires_at     timestamptz,
    error          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz,
    CONSTRAINT creative_preview_cache_platform_chk CHECK (
      platform IN ('meta', 'tiktok', 'cm360')
    ),
    CONSTRAINT creative_preview_cache_source_chk CHECK (
      source IN ('platform', 'av_library', 'none')
    ),
    CONSTRAINT creative_preview_cache_platform_key_uq UNIQUE (platform, creative_key)
  );
```

`db/schema/creativePreviewCache.ts` mirrors it one to one (`blobPathname`, `mimeType`, `width`, `height`, `source`, `sourceRef`, `fetchedAt`, `expiresAt`, `error`, `createdAt`, `updatedAt`), with the same two checks and the unique `(platform, creative_key)`. Its header says: "Do not db.select() this table until 0098 is applied (C-76)."

## 2. Blob helper and access mode (decks and AA pack)

Decks, from `lib/reports/storePerformanceReport.ts`:

```ts
  const blob = await put(`exports/reports/${mba}/${filename}`, buffer, {
    access: "private",
    contentType: PPTX_CONTENT_TYPE,
    addRandomSuffix: true,
  })
  // Store pathname only — signed Blob URLs expire; download goes through
  // GET /api/reports/download which auth-checks and streams on each click.
```

The AA (billing partner) pack, from `lib/finance/billingPartner/buildPack.ts`:

```ts
  const blob = await put(`exports/billing-partner/${fileName}`, buffer, {
    access: "private",
    contentType: ZIP,
    addRandomSuffix: true,
  })
  return { pathname: blob.pathname.replace(/^\//, "") }
```

Reads go through `lib/creative/getPrivateBlob.ts` (`get(..., { access: "private", token: BLOB_READ_WRITE_TOKEN })`).

What this means for previews: the access mode is **private**, so the store keeps the pathname, not a URL. A private blob cannot go in an `<img src>` directly. The UI needs an authenticated, tenant-checked proxy route that streams the image, the same way decks use `/api/reports/download`. For a stable key (`creative-previews/<platform>/<creative_key>.<ext>`), use `addRandomSuffix: false, allowOverwrite: true`.

## 3. Egress guard and allowlist

`scripts/check-egress-guards.mjs` (`npm run check:egress-guards`) is **not** a network host allowlist. It checks two things:

1. An empty `db.select()` from `schema.mediaPlanVersions` with no `.where(`. The allowlist is `UNSCOPED_VERSION_ALLOWLIST`, one entry, "do not add entries".
2. Runtime calls to `xanoMediaPlansUrl`, `getXanoClientsCollectionUrl` and `fetchAllXanoPages`. The allowlists are `MAIN_ONLY_COLD_XANO_BRANCHES` and `MAIN_ONLY_KNOWN_LIVE_XANO`.

A repo search for `ALLOWED_HOSTS|allowedHosts|HOST_ALLOWLIST|isAllowedHost` across `lib`, `app` and `scripts` finds nothing. No outbound host allowlist exists, so fbcdn and TikTok fetches would not be blocked. The CV2 host allowlist (`*.fbcdn.net`, `*.tiktokcdn.com`, `*.tiktokcdn-us.com`, `*.byteimg.com`) has to live in the fetch module itself. `check:egress-guards` needs no change.

## 4. `next.config` images

`next.config.mjs`:

```js
  images: {
    unoptimized: true,
  },
```

There are no `remotePatterns`. Images are served unoptimised, so a same-origin proxy route needs no config change. Nothing should add fbcdn or TikTok hosts here, because the app must never link to them.

## 5. Protected cron route to copy

`app/api/cron/billing-partner-reminders/route.ts`:

```ts
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 120
export const preferredRegion = ["syd1"]

export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }
  ...
}
```

`vercel.json` crons already use the UTC slots 19:00, 19:30, 20:00, 21:00, 21:15, 21:30, 22:00, 22:30 and 00:15 through 01:30. A quiet slot is `0 17 * * *`, which is 17:00 UTC, 04:00 Melbourne AEDT and 03:00 AEST. Nothing else runs then except the hourly `creative-upload-digest`.

## Gap: columns CV2 needs that 0098 lacks

| CV2 needs | 0098 has | Verdict |
|---|---|---|
| `view_url` (`V_CREATIVE_ASSETS.view_url`) | none | **missing** |
| kind (`V_CREATIVE_ASSETS.preview_kind`) | `mime_type` is the file type, not the preview kind | **missing** |
| source hash (detect "source changed") | `source_ref` is a loose text reference, with no hash semantics | **missing** (reusing `source_ref` would be a silent contract change) |
| Blob location | `blob_pathname` | ok (private blob: pathname only) |
| `fetched_at`, `expires_at`, `error`, `mime_type`, `client_id` | present | ok |

### Proposed migration (not written; CV2 rule)

`0102_creative_preview_cache_source.sql`, with marker `0102_creative_preview_cache_source`. It must run **after 0098**: it asserts the 0098 marker and otherwise raises.

```sql
ALTER TABLE public.creative_preview_cache
  ADD COLUMN IF NOT EXISTS preview_kind text,
  ADD COLUMN IF NOT EXISTS view_url     text,
  ADD COLUMN IF NOT EXISTS source_hash  text;
```

Option: a check on `preview_kind` against the values `V_CREATIVE_ASSETS` emits. Confirm the value set first.

Also hand-sync `db/schema/creativePreviewCache.ts`, run `db:generate`, and update `DATA-MODEL.md` and `db/README.md`.

Source hash definition for the job: sha256 of the stable source identity, meaning the `preview_image_url` without its signing query parameters (`oe`, `_nc_*`, `x-expires`, `x-signature`). Otherwise every Meta re-sign would count as a change.

## Corrections (CV2b)

- **0098 is applied.** The CV2 note that it was not came from `db/README.md` ("AUTHOR ONLY. NOT APPLIED") and the `db/schema/creativePreviewCache.ts` header, not from a database query. Localhost `.env.local` `DATABASE_URL` points at the Supabase pooler (`aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`). `select key, applied_at from migration_markers where key like '0098%'` there returns `0098_ga4_gsc_accounts_and_creative_previews` at `2026-10-14 18:38:21+00`. `creative_preview_cache` has 0 rows. Both docs are corrected.
- **`V_CREATIVE_ASSETS` is live.** The CV2b dry run reads it.
- **TikTok preview URLs are `http://`** on `p16-common-sign.tiktokcdn.com` / `p19-common-sign.tiktokcdn.com`. The fetch module upgrades http to https on allowlisted hosts and still refuses http everywhere else. The Meta hosts seen are `scontent-syd2-1.xx.fbcdn.net`, `external-syd2-1.xx.fbcdn.net` and `scontent.fmel16-1.fna.fbcdn.net`; all are https and allowed.
