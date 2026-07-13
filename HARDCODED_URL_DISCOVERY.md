# Hardcoded URL Discovery

**Date:** 2026-07-12  
**Scope:** Discovery only — findings, no fixes.

---

## 1. Search: `xg4h-uyzs-dtex` | `xano.io`

**Command equivalent:** recursive `*.ts,*.tsx,*.js,*.mjs`, excluding `node_modules` / `.next` / `dist` / `coverage`, and excluding `.env*` from the report.

### Result: **zero hits** in application/source JS/TS

No matches for `xg4h-uyzs-dtex` or `xano.io` in any `*.ts` / `*.tsx` / `*.js` / `*.mjs` file under the repo (excluding `node_modules` and build dirs).

Confirmed with both:

- `rg -n --glob "!node_modules/**" --glob "!**/.env*" --glob "*.{ts,tsx,js,mjs}" "xg4h-uyzs-dtex|xano\.io"`
- PowerShell `Get-ChildItem -Recurse -Include *.ts,*.tsx,*.js,*.mjs` + `Select-String` (with `node_modules` / `.next` / `dist` / `coverage` filtered out)

### Classification table

| Path | Line | Classification | Client-side risk? |
|------|------|----------------|-------------------|
| — | — | — | — |

**No rows.** Nothing to classify as env fallback, comment, or genuine hardcoded URL.

### Related (out of search scope / not matching pattern)

| Item | Notes |
|------|--------|
| `.env*` files | Excluded from report per instructions. Hostnames live in env vars at runtime via `lib/api/xano.ts` (`getXanoBaseUrl` / `xanoUrl`). |
| Discovery markdown (`DISCOVERY-*.md`, `domain-4/**`) | Contains `https://xg4h-uyzs-dtex.a2.xano.io/...` — docs only, not runtime code. |
| Test mocks | `https://xano.test` / `https://example.test` in unit tests — do **not** match `xano.io`. |
| `NEXT_PUBLIC_*` Xano vars | **None found.** |
| `"use client"` + hardcoded Xano host | **None found.** |

### Client-side flag summary

**No client-shipped hardcoded Xano hosts.** Bases are resolved server-side from env (`process.env.XANO_*`) through `xanoUrl()`; missing env on server throws; on the client `getRequiredEnv` returns `""` rather than a hardcoded host.

---

## 2. Consumers: `MEDIA_CONTAINER_ENDPOINTS` / `fetchAllMediaContainerLineItems`

**Definition:** `lib/api/media-containers.ts`

- `MEDIA_CONTAINER_ENDPOINTS` — exported map of media-type key → Xano path segment (e.g. `television` → `television_line_items`)
- `fetchAllMediaContainerLineItems(mbaNumber, versionNumber?, mediaTypeFilter?)` — fans out to `fetchMediaContainerLineItems` per key in that map
- URL build uses `xanoUrl(..., ["XANO_MEDIA_CONTAINERS_BASE_URL", "XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])` — env-driven, not hardcoded host

### Direct external consumers

| # | File | What it uses | Role |
|---|------|--------------|------|
| 1 | `app/api/campaigns/[mba_number]/route.ts` | **Both** `MEDIA_CONTAINER_ENDPOINTS` + `fetchAllMediaContainerLineItems` | Campaign GET: derives enabled media types from version flags, fetches filtered line items, logs endpoint URLs in dev via `xanoUrl(MEDIA_CONTAINER_ENDPOINTS[key], ...)` |
| 2 | `app/api/mediaplans/mba/[mba_number]/material-instructions/route.ts` | `fetchAllMediaContainerLineItems` only | MI workbook export API: loads all line items for MBA, then `resolveMiPlan` / `buildMiWorkbook` |
| 3 | `lib/ava/tools/startMiInterview.ts` | `fetchAllMediaContainerLineItems` only | Ava tool `start_mi_interview`: loads line items for scoped MBA, builds interview payload |
| 4 | `lib/ava/tools/generateMiWorkbook.ts` | `fetchAllMediaContainerLineItems` only | Ava tool generate-MI-workbook: loads line items, resolves plan, builds/stores workbook |
| 5 | `lib/ava/tools/getCampaignContext.ts` | `fetchAllMediaContainerLineItems` only | Ava tool `get_campaign_context`: parallel with `getAvaXanoSummary`, flattens/caps line items |

### Type-only import (not a runtime consumer of the map/fn)

| File | Import | Notes |
|------|--------|--------|
| `lib/ava/tools/summaries.ts` | `import type { MediaContainerLineItem }` | Type only — does not call `fetchAllMediaContainerLineItems` or read `MEDIA_CONTAINER_ENDPOINTS` |

### Internal consumers (same module)

Inside `lib/api/media-containers.ts`, `fetchAllMediaContainerLineItems` is also called by:

| Function | Lines (approx) | External importers? |
|----------|----------------|---------------------|
| `aggregateMonthlySpendByMediaType` | ~299 | **None** — defined only, unused outside module |
| `getSpendByMediaTypeFromLineItems` | ~350 | **None** |
| `getSpendByCampaignFromLineItems` | ~395 | **None** |

`fetchMediaContainerLineItems` is only used internally by `fetchAllMediaContainerLineItems`.

### Completeness vs known list

User-known consumers accounted for:

- MI tools → `startMiInterview.ts`, `generateMiWorkbook.ts` (+ related MI route)
- `app/api/campaigns/[mba_number]/route.ts`

**Additional consumers found:**

1. `app/api/mediaplans/mba/[mba_number]/material-instructions/route.ts`
2. `lib/ava/tools/getCampaignContext.ts`

**No other** `*.ts` / `*.tsx` / `*.js` / `*.mjs` importers of `MEDIA_CONTAINER_ENDPOINTS` or `fetchAllMediaContainerLineItems`.

---

## Summary

1. **Hardcoded production Xano hosts in code: none.** Env + `xanoUrl` only; no browser-shipped hardcoded URLs.
2. **Five runtime call sites** for `fetchAllMediaContainerLineItems` (one of which also imports `MEDIA_CONTAINER_ENDPOINTS`); three dead-export spend helpers call it only internally.
)
