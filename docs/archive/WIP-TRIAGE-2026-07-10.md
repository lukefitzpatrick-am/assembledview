# WIP TRIAGE — 2026-07-10

**Goal:** Normalise CRLF → LF on three WIP files, keep real changes, verify. **No commits.**

---

## Phase 0 — Safety snapshot

Archive folder: `C:\Projects\_avmediaplan-discovery-archive\`

| Artifact | Path |
|----------|------|
| Raw diff | `wip-triage-2026-07-10-raw.patch` |
| Semantic diff (`--ignore-cr-at-eol`) | `wip-triage-2026-07-10-semantic.patch` |
| MBA route WIP copy | `mba-route-wip-2026-07-10.ts` |
| Edit page WIP copy | `mba-edit-page-wip-2026-07-10.tsx` |
| Billing parser WIP copy | `parsePersistedBillingScheduleToMonths-wip-2026-07-10.ts` |
| Stray root patch moved | `page-diff-2026-07-10.patch` (from `page-diff.patch`) |

### Pre-normalise SHA256 (working tree, still CRLF)

| File | Hash |
|------|------|
| `app/api/mediaplans/mba/[mba_number]/route.ts` | `D4E17111ACD9F49DA73FD80B563048B580AC29E82F2148C323C7AA526338C894` |
| `app/mediaplans/mba/[mba_number]/edit/page.tsx` | `B04066BD358CCF97F24A13CB9BB6A81F13C1BC246CC26743336E96765763383E` |
| `lib/billing/parsePersistedBillingScheduleToMonths.ts` | `9F1C80B5E7AF9DEBCB16076A9CDA75F0E1163722120C500D667B57EA1FEDA0CD` |

---

## Phase 1 — EOL diagnosis

| Check | Result |
|-------|--------|
| `git config --get core.autocrlf` | `true` |

| File | Index (`i/`) | Working (`w/`) | Attr | Mixed? |
|------|--------------|----------------|------|--------|
| MBA route | `lf` | `crlf` | (none) | No |
| Edit page | `lf` | `crlf` | (none) | No |
| Billing parser | `lf` | `crlf` | (none) | No |

**Action taken:** CRLF → LF on all three (match index). No hard stop.

---

## Phase 2 — Normalise

Ran `[IO.File]::ReadAllText` → `-replace "`r`n","`n"` → `WriteAllText` on each of the three paths only. No prettier / editor save.

### Content integrity vs Phase 0 archives (EOL-agnostic)

| File | Result |
|------|--------|
| route | **IDENTICAL** ignoring EOL |
| edit page | **IDENTICAL** ignoring EOL |
| billing parser | **IDENTICAL** ignoring EOL |

---

## Phase 3 — Verify

### `git diff --stat` (final)

```
 app/api/mediaplans/mba/[mba_number]/route.ts       | 12 +++-
 app/mediaplans/mba/[mba_number]/edit/page.tsx      | 80 ++++------------------
 .../parsePersistedBillingScheduleToMonths.ts       |  5 ++
 3 files changed, 27 insertions(+), 70 deletions(-)
```

Matches expected approximate sizes (route ~12 lines; edit ~80 with net −53 as formatAUD collapse; billing +5). **No thousands-of-lines noise.** Pass.

### Semantic content check

- **route.ts:** `Request` → `NextRequest` on PUT + PATCH; `checkClientMbaAccess` guard on both. Matches Phase 0 semantic intent.
- **billing parser:** `billingMode` `"auto"|"manual"` carried into returned line items. Matches.
- **edit page:** `formatMoney(... USD opts)` → `formatAUD(...)` only (hunks sampled). Matches.

### `git status --porcelain`

Only the three ` M ` files above, plus known untracked (discovery docs, `.mcp.json`, billingMode test, `npm-audit-snapshot.json`, `DISCOVERY-repo-state-2026-07-10.md`). `page-diff.patch` gone from root (moved to archive). Nothing unexpected.

Note: Git warns `LF will be replaced by CRLF the next time Git touches it` because `core.autocrlf=true` — expected on Windows; does not reintroduce the noise into `git diff --stat` for this normalise.

---

## Phase 4 — Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | **exit 0** (no errors) |
| BillingMode test | **PASS** — `npx tsx --test lib/billing/__tests__/parsePersistedBillingScheduleToMonths.billingMode.test.ts` → 1 pass, 0 fail |

Runner note: project uses `tsx --test` (per `package.json` billing scripts), not jest/vitest.

---

## Phase 5 — Stop

**Do not commit yet.** Hold for browser smoke, then three separate commits (commands next session):

1. `feat(security): require client MBA access on mediaplans/mba PUT and PATCH` — `route.ts` only
2. `feat(billing): carry billingMode through persisted schedule parsing` — parser + `__tests__/parsePersistedBillingScheduleToMonths.billingMode.test.ts`
3. `fix(mediaplans): format partial MBA amounts as AUD` — `edit/page.tsx` only

### Verdict

| Item | Status |
|------|--------|
| EOL noise collapsed | Yes |
| Real changes preserved | Yes (archive identity + semantic review) |
| tsc clean | Yes |
| billingMode test | Pass |
| Commits | **Deferred** pending smoke |
