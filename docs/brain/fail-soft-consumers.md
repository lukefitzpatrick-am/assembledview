# Fail-soft consumers of `GET /api/clients`

Companion to the fail-soft invariant in `INVARIANTS.md`.

## The signal

When `getCachedClientsList()` throws, `app/api/clients/route.ts` returns:

- HTTP **200**
- body `[]`
- header `x-warning: clients-unavailable`

(Deliberate so the sidebar does not hard-fail.) A second header value, `served-stale-after-upstream-failure`, can accompany a **non-empty** stale body — that is degraded-but-usable, not the empty fail-soft.

Shared helper: `lib/clients/fetchClientsList.ts` (`fetchClientsList` → `{ ok, data, warning }`). **Own fetch path** — not `coalescedGetJson` — because coalesced caches parsed JSON only and drops headers; clients is the endpoint where empty-vs-broken depends on `x-warning`.

---

## Fourteen callers that treat(ed) `200 + []` as success

Severity: **wrong-action** = user can save / create / grant with a missing or wrong client context; **blank-ui** = empty picker/filter/nav with no wrong write.

| # | Consumer | Fail-soft looks like today | Severity | Status |
|---|---|---|---|---|
| 1 | `app/mediaplans/create/page.tsx` | Was: empty client select | **wrong-action** | **Converted** — `fetchClientsList`; error + save blocked |
| 2 | `app/mediaplans/mba/[mba_number]/edit/page.tsx` | Was: `setClients([])` via coalesced | **wrong-action** | **Converted** — `fetchClientsList`; error + save blocked |
| 3 | `app/admin/users/new/NewAdminUserForm.tsx` | Was: empty client dropdown for role=client | **wrong-action** | **Converted** — error alert; submit blocked when role=client |
| 4 | `app/tasks/TasksPageClient.tsx` | Reference fix → ViewState error | was wrong-action | **Converted** — uses shared helper |
| 5 | `components/finance/sections/SectionScopeBar.tsx` | Empty client scope options on finance sections | blank-ui (wrong FY/client filter → wrong *view*, not wrong save) | open |
| 6 | `components/finance/sections/xero/XeroExceptionsPanel.tsx` | Empty client labels / options in Xero exception UI | blank-ui (mis-identify exceptions) | open |
| 7 | `components/pacing/PacingFilterToolbar.tsx` | Empty client filter options | blank-ui | open |
| 8 | `lib/pacing/usePacingClientIdToNameMap.ts` | Id→name map empty; pacing rows show raw ids / missing names | blank-ui | open |
| 9 | `components/creative/CreativeCampaignPicker.tsx` | Empty client list in picker (this file *does* set an error on `!res.ok`, but fail-soft is `ok`) | blank-ui / blocked pick | open |
| 10 | `components/creative/CreativeAdminLanding.tsx` | Empty clients half of landing fetches | blank-ui | open |
| 11 | `components/creative/CreativeAssetManager.tsx` | Client meta / options empty | blank-ui | open |
| 12 | `components/planning/StageBrief.tsx` | Empty client options in Planning brief | blank-ui | open |
| 13 | `app/scopes-of-work/create/page.tsx` | Was: empty client select on SOW create | **wrong-action** | **Converted** — error + save blocked |
| 14 | `app/scopes-of-work/[id]/edit/page.tsx` | Was: empty clients → wrong `scope_id` derivation | **wrong-action** | **Converted** — error + save blocked |

### Ranking for Luke (remaining)

1. **Finance / pacing / creative / planning** (#5–12) — mostly blank or mislabelled filters; wrong *view* more than wrong *write*. Wire through `fetchClientsList` / `applyClientsFetchResult`.

---

## Related (not in the fourteen)

| Consumer | Note |
|---|---|
| `components/AppSidebar.tsx` | **Why fail-soft exists.** Empty client nav on warning — blank-ui, intentional soft landing. Do not convert until product decides otherwise. |
| `lib/finance/excelFinanceExport.ts` | Export stamps legal name/ABN from `/api/clients`; fail-soft → blank/fallback display names on Excel — **wrong-action** on exported artefacts. Not counted in the fourteen UI list. |
| `components/AddClientForm.tsx` | **POST** `/api/clients` — not a GET consumer of the fail-soft path. |

---

## Follow-ups

1. ~~Shared helper `fetchClientsList()`~~ — done (`lib/clients/fetchClientsList.ts`).
2. ~~Fix #1–3 + SOW #13–14~~ — done this pass.
3. Convert blank-ui filters (#5–12).
4. Longer term: decide whether route fail-soft stays (sidebar) vs 503 with structured body — separate product call.
