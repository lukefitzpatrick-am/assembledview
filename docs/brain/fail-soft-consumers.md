# Fail-soft consumers of `GET /api/clients`

Inventory only — do not fix here. Companion to the fail-soft invariant in `INVARIANTS.md`.

## The signal nobody reads

When `getCachedClientsList()` throws, `app/api/clients/route.ts` returns:

- HTTP **200**
- body `[]`
- header `x-warning: clients-unavailable`

(Deliberate so the sidebar does not hard-fail.) A second header value, `served-stale-after-upstream-failure`, can accompany a **non-empty** stale body — that is degraded-but-usable, not the empty fail-soft.

**None of the consumers below read `x-warning`.** `coalescedGetJson` returns parsed JSON only and drops headers, so coalesced callers cannot see the signal without a helper change.

Reference fix (one consumer): `app/tasks/TasksPageClient.tsx` treats `x-warning: clients-unavailable` as ViewState **error**, not empty clients.

---

## Fourteen callers that treat `200 + []` as success

Severity: **wrong-action** = user can save / create / grant with a missing or wrong client context; **blank-ui** = empty picker/filter/nav with no wrong write.

| # | Consumer | Fail-soft looks like today | Severity |
|---|---|---|---|
| 1 | `app/mediaplans/create/page.tsx` (`fetchClients`) | Empty client select; create blocked or proceeds without a real client choice depending on form guards | **wrong-action** (MBA create identity) |
| 2 | `app/mediaplans/mba/[mba_number]/edit/page.tsx` (`coalescedGetJson`) | `setClients([])` — client name/id resolution for the open plan goes blank; fee/client-derived UI can mislabel | **wrong-action** (editor context) |
| 3 | `app/admin/users/new/NewAdminUserForm.tsx` | Empty client dropdown for role=client; submit can be blocked, or Auth0 client binding never offered — admin may create a user with wrong/missing tenant link after retrying blindly | **wrong-action** (access grant) |
| 4 | `app/tasks/TasksPageClient.tsx` | Was: empty Client filter + TaskFormDialog cannot satisfy positive `client_id` → POST never fires (looks like “broken create”). **Fixed this commit** → ViewState error | was wrong-action / blocked-write; now error |
| 5 | `components/finance/sections/SectionScopeBar.tsx` | Empty client scope options on finance sections | blank-ui (wrong FY/client filter → wrong *view*, not wrong save) |
| 6 | `components/finance/sections/xero/XeroExceptionsPanel.tsx` | Empty client labels / options in Xero exception UI | blank-ui (mis-identify exceptions) |
| 7 | `components/pacing/PacingFilterToolbar.tsx` | Empty client filter options | blank-ui |
| 8 | `lib/pacing/usePacingClientIdToNameMap.ts` | Id→name map empty; pacing rows show raw ids / missing names | blank-ui |
| 9 | `components/creative/CreativeCampaignPicker.tsx` | Empty client list in picker (this file *does* set an error on `!res.ok`, but fail-soft is `ok`) | blank-ui / blocked pick |
| 10 | `components/creative/CreativeAdminLanding.tsx` | Empty clients half of landing fetches | blank-ui |
| 11 | `components/creative/CreativeAssetManager.tsx` | Client meta / options empty | blank-ui |
| 12 | `components/planning/StageBrief.tsx` | Empty client options in Planning brief | blank-ui |
| 13 | `app/scopes-of-work/create/page.tsx` | Empty client select on SOW create | **wrong-action** (create SOW for wrong/missing client if validation weak) |
| 14 | `app/scopes-of-work/[id]/edit/page.tsx` | Empty client select on SOW edit | **wrong-action** (reassign / mislabel) |

### Ranking for Luke (priority)

1. **Media plan create + edit** (#1–2) — confirm: highest. Empty list can produce wrong campaign client identity or silent loss of client context on save-adjacent UI.
2. **Admin new user form** (#3) — confirm: next. Empty list blocks or corrupts Auth0 client binding for `role=client`.
3. **Scopes of work create/edit** (#13–14) — same class as create forms (client is write identity).
4. **Finance / pacing / creative / planning** (#5–12) — mostly blank or mislabelled filters; wrong *view* more than wrong *write*.
5. **Tasks** (#4) — fixed in this commit.

---

## Related (not in the fourteen)

| Consumer | Note |
|---|---|
| `components/AppSidebar.tsx` | **Why fail-soft exists.** Empty client nav on warning — blank-ui, intentional soft landing. Still should eventually read the header. |
| `lib/finance/excelFinanceExport.ts` | Export stamps legal name/ABN from `/api/clients`; fail-soft → blank/fallback display names on Excel — **wrong-action** on exported artefacts. Not counted in the fourteen UI list. |
| `components/AddClientForm.tsx` | **POST** `/api/clients` — not a GET consumer of the fail-soft path. |

---

## Recommended follow-ups (not this commit)

1. Shared helper: `fetchClientsList()` that returns `{ ok, data, warning }` and refuses to call empty “success”.
2. Teach `coalescedGetJson` (or a sibling) to surface selected headers.
3. Fix #1–3 next; then SOW; then filters.
4. Longer term: decide whether route fail-soft stays (sidebar) vs 503 with structured body — separate product call.
