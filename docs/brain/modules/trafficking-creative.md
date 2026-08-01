# Module: Trafficking & Creative

**Trafficking** = a naming-convention builder: seeds per-platform grids from an MBA's plan, composes DV360/CM360/Meta/etc names via a strict template engine, exports an Excel workbook. Deliberately **non-persistent** (a download generator — don't add a save). **Creative** = asset upload/management per MBA + AI copy generation + live/social/TV mockup rendering.

## Trafficking / naming

- `components/trafficking/TraffickingBuilder.tsx` (~850 lines) — the builder; publishes AVA `PageContext` (surface `trafficking`).
- `lib/naming/templates.ts` — **THE LAW** for element orders (not any doc). DV360 templates cover all programmatic; CM360 covers other digital. Open defaults greppable as `DEFAULT(Qn)`.
- `lib/naming/{compose,parse,validate,formula}.ts` — round-trip rule engine. `_` in values, `-` separator, charset `[a-z0-9_+x]`, `line_item_id` always LAST at pacing grain.
- `lib/naming/exportTraffickingWorkbook.ts` / `exportNamingWorkbook.ts` — exceljs outputs; `INVALID_NAME_CELL = "INVALID: fix in AV"`.
- `lib/naming/fromPlan.ts::extractPlanGlobals` — the plan→naming seam (used by both mega-pages).
- Search suffix rule couples names to Google Ads pacing — see INVARIANTS (naming law).
- Cleanly isolated: `lib/naming` imports almost nothing from other domains; 13 tests guard round-trips.

## Creative

- `components/creative/CreativeAssetManager.tsx` — asset table/upload/filters + Search Ad Workshop; AVA surface `creative`.
- `lib/creative/xanoCreativeAssets.ts` — Xano CRUD (`creative_asset` table) incl. `createIdempotent`.
- `lib/creative/{adCopy,searchCopy}/**` — Claude copy generation (shares `lib/ava/anthropic`); client-brain fetch; web research; in-memory rate limits.
- `lib/creative/liveMockup/**` — ScreenshotOne (HMAC-signed), creative injection into live ad slots, **SSRF guards** (`validateTargetUrl` + `privateIp`) — changes there are security changes; `block_ads=false`/`ignore_host_errors=true` are deliberate.
- `lib/creative/getPrivateBlob.ts` — **cross-domain**: shared by creative, MI-spec, and performance-report download routes.
- `lib/creative/types.ts` — `CREATIVE_ASSET_CREATE_BODY_KEYS`/`WRITABLE_KEYS` lists must both be edited when adding a Xano column or POSTs silently drop the field.

## Access model

- Staff trafficking/creative pages guard by **excluding** role `client` (not requiring admin) — a role that is neither gets through.
- `/creative` admin landing is process-first (`CreativeAdminLanding`: search-ads → Ask Ava, upload → existing `CreativeCampaignPicker`, screenshots → Codex `TaskFormDialog` when `CODEX_V2=on`). Non-admin staff keep the filter-first picker; client dashboard creative is untouched.
- Creative API MBA surfaces call `checkClientMbaAccess` for **all** roles (SEC-G); helper scopes only `admin` as unscoped — empty-MBA non-admin sessions → 403.
- Client-facing creative view is separate: `app/dashboard/[slug]/creative` (tenant-checked with `notFound()`).

## Gotchas

- `lib/creative` imports types from `components/creative/**` (components→lib inversion) — non-portable to server-only bundles.
- `lib/creative/lineItemOptions.ts` keeps its own copy of `LINE_ITEM_SOURCE_TABLES` (drift risk with the media-plans maps).
- Upload digest imports `lib/billing/scheduleHeaders` — creative→billing coupling via the hourly cron.
- Legacy `lib/namingConventions.ts` removed — use `buildNamingWorkbook`.
