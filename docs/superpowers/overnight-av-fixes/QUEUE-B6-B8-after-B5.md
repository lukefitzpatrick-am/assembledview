# Queue: B6 and B8 items left by B5 / B5a

Status: B6 holds done (3 Nov 2026). B8 list done (3 Nov 2026) except the dependencies row: only `@babel/runtime` and `core-js` went; the rest of that row is still open. Kept for the record.

## Held for B6 (backend switch and shadow leftovers): done

- `lib/security/proxyAllowlist.ts`: the unused `MEDIA_PLANS_ALLOWLIST` and its checker (which carried the `replaceChannelLineItems` DELETE allowance) were removed (B6 commit 2).
- `scripts/check-egress-guards.mjs:57`: the stale entry went with the whole cold-branch allowlist; rule 2 is now "no Xano host, no `XANO_*` env read" (B6 commit 4).
- `app/api/plans/save/route.ts`: header comment corrected and the `WRITE_BACKEND` switch removed (B6 commit 2).

## Vercel env vars to delete after the B6 deploy (Luke)

No code reads these after B6. Delete them from production and preview.

- `DATA_BACKEND`, `DATA_BACKEND_APPROVALS`, `WRITE_BACKEND` (set to `postgres` today), plus `DATA_BACKEND_PLAN_DETAIL` or any other `DATA_BACKEND_<DOMAIN>` if present, **except `DATA_BACKEND_FINANCE_SCHEDULE`** (still read; keep it).
- `LINE_ITEM_SNAPSHOT_SOURCE`.
- `PLANC_C1_FULL_SCOPE` (unread since 31 Jul; its file goes in B8).
- The `XANO_*` names listed in `docs/brain/XANO-SEVERANCE-REGISTER.md` (production env section): no app, lib or component code reads any `XANO_*` env var, and `check:egress-guards` now fails if one is added.

Keep: `DATA_BACKEND_FINANCE_SCHEDULE` (a separate live switch, `shadow` today), `SAVE_GATE_FULL_SCOPE`.

## B8 list (no app caller after B5; reviewer's list merged with the builder's): done

Done in B8 (container commits, queued as patches 0010 to 0014):
- Finance helpers (0010): `humaniseBillingSaveError.ts`, the four `preservePriorBilling.ts` exports, `applyDateBasisKeepOrReset.ts`, `c1FullScopeGate.ts`; `assertCoreScheduleParity` moved to `lib/finance/__tests__/fixtures` (test helper only).
- Publish and save helpers (0011): `shouldRunDeferredMasterPublish`, `shouldBlockEmptyPublish`, `SESSION_EXPIRED_PUBLISH_MESSAGE`, `createSemaphore.ts` with the `test:xano-mirror` script, the create page's unused `investmentPerMonth` memo, and `mergeInvestmentMonths.ts`, which that left without a caller.
- Data (0012): `readChannelLineItems`, `filterXanoItemsToPublishedTips` (and the helpers only it used).
- Planning (0013): the dead 401 and `XANO_API_KEY` branches; a missing `DATABASE_URL` stays 502 (C-167, Luke's call).
- Dependencies (0014): `@babel/runtime` and `core-js` removed from `package.json`; `npm ls` shows jspdf, canvg, json-schema-to-ts and react-transition-group still bring them in.
- Still open from the table: `autoprefixer`, `mammoth`, `@radix-ui/react-switch`, `drizzle-zod`, the unlisted imports, and the two orphan tests the B7 review found (`socialAdSetBreakdown.test.tsx`, `adminNotices.render.test.tsx`).

| Item | File | Notes |
|---|---|---|
| `humaniseBillingSaveError`, `isBillingSaveGateError`, `withMbaScopeLineLabels` | `lib/finance/humaniseBillingSaveError.ts` | All 3 exports; only the deleted Xano version bodies used them |
| `diffBillingActivity`, `formatPreservePriorAlert`, `collectPersistedBillingLineIds`, `describePreservePriorMerge` | `lib/finance/preservePriorBilling.ts` | Keep `findStaleDateBasisOverrides` (live on the edit page). `describePreservePriorMerge` (line ~175) had no caller before B5 either |
| `applyDateBasisKeepOrReset` | `lib/finance/applyDateBasisKeepOrReset.ts` | Was the C3 save preflight |
| `assertCoreScheduleParity` | `lib/finance/assertCoreScheduleParity.ts` | Was the create post-save parity check |
| `SESSION_EXPIRED_PUBLISH_MESSAGE` | `lib/auth/writeSessionExpiry.ts` | Was the publish-retry copy |
| `createSemaphore`, `lineItemWriteSemaphore`, `LINE_ITEM_WRITE_CONCURRENCY` | `lib/utils/createSemaphore.ts` | Only `test:xano-mirror` (`createSemaphore.test.ts`) uses them; orphaned before B5. Keep the script name (frozen-name caution) or drop the script with the file |
| `shouldRunDeferredMasterPublish`, `shouldBlockEmptyPublish` | `lib/mediaplan/publishVersionIntegrityClient.ts` (re-exported by `publishVersionIntegrity.ts`) | No editor stage-then-publish since B5 |
| Unused `investmentPerMonth` / `mergeInvestmentMonths(...)` | `app/mediaplans/create/page.tsx` ~926 | Pre-existing unused memo; edit's copy went in B5 |
| `readChannelLineItems` | `lib/data/readMediaPlans.ts` | No caller (only a query label string); its `_xanoFetcher` param went in B6 |
| `lib/finance/c1FullScopeGate.ts` (DEAD-6) | `lib/finance/c1FullScopeGate.ts` | No importer since 31 Jul; the only reader of `PLANC_C1_FULL_SCOPE` (env already inert, delete in Vercel) |
| `filterXanoItemsToPublishedTips` | `lib/snowflake/tipScopeLineItems.ts:48` | No app caller; only `scripts/_archive/xano/verify/line-item-snapshot-parity.ts` imports it. Keep `PublishedTipPointer` (used by `publishedVersionPointerAudit.ts`) and check `indexTipPointersByMba` / `TipScopeStats` for other users before deleting |
| I-1: dead `XANO_API_KEY` branch | `app/api/planning/audiences/route.ts:17` | Nothing throws a `XanoPlanningAudienceError` naming `XANO_API_KEY`, and nothing throws status 401, so the 401 branch here and in `[id]/route.ts:17` is dead too. Today the 500 "DATABASE_URL is not set" error falls through to a 502 on this route; whether it should stay a 500 is a small behaviour change to confirm in B8 |
| Dependencies knip reports now that `knip.json` hides none (B7 G4) | `package.json` | Unused: `@babel/runtime`, `autoprefixer` (`postcss.config.mjs` loads only tailwindcss), `core-js`, `mammoth`, `@radix-ui/react-switch`, `drizzle-zod`. Unlisted: `sharp` in `lib/reports/deckCreative/loadDeckCreatives.ts` (app code; resolves today only because `next` pulls sharp in), `postcss-load-config` (a JSDoc type in `postcss.config.mjs`), and script-only `fast-xml-parser` / `playwright`. Each fix shrinks `scripts/knip-baseline.json` (`npm run check:knip -- --update`). Under 90% that `@babel/runtime` and `core-js` have no runtime consumer; check `npm ls` before removing |

Done in B5a (not for B8): the unused `opts` parameter on create's `handleSaveMediaPlanVersion`.

## For G6 (tests in no script)

- I-3: `lib/kpi/__tests__/syncCampaignKpis.test.ts` is in no npm script, and 8 of its 9 tests fail without a database (B6 run). G6 decides: give it a DB-backed script, split out the one pure test, or delete it.
- B7 wired `test:line-item-snapshot` (`lib/snowflake/__tests__`: the two tests restored from the B6 parity file, plus `assumeSpendSnapshot`, `syncXanoLineItemsPrune` and `xanoLineItemPruneDryRun`, which were in no script) and `test:egress-guards`.

### Tests each B8 deletion touches

| Deletion | Test files to update or delete |
|---|---|
| `humaniseBillingSaveError.ts` | `lib/finance/__tests__/humaniseBillingSaveError.test.ts` |
| `preservePriorBilling.ts` exports | `lib/finance/__tests__/preservePriorBilling.test.ts` |
| `applyDateBasisKeepOrReset.ts` | `lib/finance/__tests__/mbaBillingModalNoOverridePost.mb23.test.ts` names it in `doesNotMatch` pins only (still passes after the delete; tidy the regex) |
| `assertCoreScheduleParity.ts` | `lib/finance/__tests__/assertCoreScheduleParity.test.ts`, `lib/mediaplan/__tests__/burstDateParity.test.ts` |
| `createSemaphore.ts` | `lib/utils/__tests__/createSemaphore.test.ts` (the only file in `test:xano-mirror`) |
| `shouldRunDeferredMasterPublish`, `shouldBlockEmptyPublish` | `lib/mediaplan/__tests__/deferredMasterPublishIntent.test.ts`, `lib/mediaplan/__tests__/publishVersionIntegrity.test.ts`, `lib/mediaplan/__tests__/postgresSavePayload.integration.test.ts` (B5 `doesNotMatch` pin names them; still passes) |
