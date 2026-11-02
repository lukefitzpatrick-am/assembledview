# Queue: B6 and B8 items left by B5 / B5a

Status: open (2 Nov 2026). Inputs for the B6 and B8 prompt packs. Delete or mark done when those batches land.

## Held for B6 (backend switch and shadow leftovers)

- `lib/security/proxyAllowlist.ts:14-59`: comments name `replaceChannelLineItems` as the consumer of each channel segment, and the DELETE `{segment}/{numericId}` allowance exists only for it. Both editors stopped calling it in B5.
- `scripts/check-egress-guards.mjs:57`: stale entry for `lib/api/replaceChannelLineItems.ts` (`listExistingRows`, cold Xano under `WRITE_BACKEND`). The file no longer exists.
- `app/api/plans/save/route.ts`: the header comment still says the route is inactive while `WRITE_BACKEND=xano` is the default. The default is `postgres`; B6 removes the `xano` value.

## B8 list (no app caller after B5; reviewer's list merged with the builder's)

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

Done in B5a (not for B8): the unused `opts` parameter on create's `handleSaveMediaPlanVersion`.

### Tests each B8 deletion touches

| Deletion | Test files to update or delete |
|---|---|
| `humaniseBillingSaveError.ts` | `lib/finance/__tests__/humaniseBillingSaveError.test.ts` |
| `preservePriorBilling.ts` exports | `lib/finance/__tests__/preservePriorBilling.test.ts` |
| `applyDateBasisKeepOrReset.ts` | `lib/finance/__tests__/mbaBillingModalNoOverridePost.mb23.test.ts` names it in `doesNotMatch` pins only (still passes after the delete; tidy the regex) |
| `assertCoreScheduleParity.ts` | `lib/finance/__tests__/assertCoreScheduleParity.test.ts`, `lib/mediaplan/__tests__/burstDateParity.test.ts` |
| `createSemaphore.ts` | `lib/utils/__tests__/createSemaphore.test.ts` (the only file in `test:xano-mirror`) |
| `shouldRunDeferredMasterPublish`, `shouldBlockEmptyPublish` | `lib/mediaplan/__tests__/deferredMasterPublishIntent.test.ts`, `lib/mediaplan/__tests__/publishVersionIntegrity.test.ts`, `lib/mediaplan/__tests__/postgresSavePayload.integration.test.ts` (B5 `doesNotMatch` pin names them; still passes) |
