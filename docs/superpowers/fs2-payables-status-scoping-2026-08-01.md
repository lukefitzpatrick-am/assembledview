# FS-2 — Corrected payables figures + status scoping (report-first)

Status: live recon 2026-08-01 · FY2026 `2026-07`→`2026-08` · delivery · published tips  
Command: `npm run recon:finance-sections-summary -- --fy=2026`  
Constraint: **no behaviour change** (status filter not applied; Costs banner stays).

---

## 1. Corrected payables (both compositions)

| Slice | Amount | vs Claude |
|-------|--------|-----------|
| Joined attributed media (ex client-pays, `li` matched) | **$555,494.98** | MATCH |
| Orphan non-service media (`li` NULL — still in FS-2 attributed) | **$83,593.95** | Claude folded into campaign-level |
| Attributed media incl. orphans (FS-2 default) | **$639,088.93** | Claude −$83,593.95 (partition only) |
| Client-pays media excluded | **$64,818.00** | MATCH |
| `__service__*` media components only | **$1,567,424.19** | — |
| Claude-style campaign-level (= service media + orphans) | **$1,651,018.14** | MATCH |
| `__service__*` all components (media+fee+ads synthetics) | **$1,745,844.00** | not Claude’s labelled bucket |
| Fee (all delivery fee components) | **$184,621.15** | MATCH |
| Adserving (all) | **$798.66** | MATCH |
| **A. Media-only bundle** (joined media + service media + orphans = media_attr + service_media) | **$2,206,513.12** | MATCH Claude “media-only” |
| **B. Media + fee + adserving** (sections summary SQL) | **$2,391,932.93** | MATCH |
| Legacy hub payables (UI path: `include_drafts=0`, **media-only**) | **$344,721.36** | Claude cited $890,369.89 — **not reproduced** (see below) |
| Legacy with API default drafts-on (`includeNonBooked=true`) | $603,744.98 | still ≠ $890,369.89 |

### Difference vs Claude (before decisions)

1. **Headline totals A and B match.** Fee, adserving, client-pays match.
2. **Media vs campaign-level partition:** Claude’s “attributed media $555,494.98” = rows with a successful `line_items` join. FS-2 also counts **$83,593.95** of orphan schedule media (`li` NULL — e.g. `krusty001`, `glenda008` production id, dual-shape leftovers) as attributed (client_pays COALESCE false). Claude put those orphans into the campaign-level bucket. **Same dollars; different label.** Sum of Claude media + Claude campaign-level = our media_attr + service_media = **$2,206,513.12**.
3. **Claude “campaign-level $1,651,018.14”** is **`__service__*` media components + orphans**, not the full `__service__*` sum ($1,745,844 includes fee/ads synthetics already counted in fee/adserving lines).
4. **Legacy $890,369.89 unreproduced.** Hub UI default `includeDrafts: false` → `include_drafts=0` → **booked|approved|completed**, media-only via `derivePayableRecords` / `agencyOwedDeliveryMediaTotal` → **$344,721.36**. Drafts-on → $603,744.98. Neither equals Claude’s $890k — treat Claude’s legacy figure as a different extract (open).

---

## 2. Per-MBA legacy vs sections payables

Legacy = hub UI path (`composePayableRecordsForMonth`, `includeNonBooked: false`, media-only).  
Sections = published tip delivery media+fee+adserving ex client-pays media.  
44 non-zero Δ rows; every row dispositioned.

| MBA | Status | Legacy | Sections | Δ | Cause |
|-----|--------|--------|----------|---|-------|
| krusty002 | approved | $0 | $620,000.02 | +$620,000.02 | synthetic campaign-level months |
| krusty013 | draft | $0 | $202,500.00 | +$202,500.00 | status scope |
| PENFOLD015 | approved | $0 | $190,867.01 | +$190,867.01 | synthetic campaign-level months |
| jayco018 | approved | $0 | $95,000.00 | +$95,000.00 | synthetic campaign-level months |
| hartm010 | planned | $0 | $84,098.36 | +$84,098.36 | status scope |
| sinch001 | approved | $0 | $75,376.10 | +$75,376.10 | synthetic campaign-level months |
| BOSS006 | approved | $0 | $62,135.25 | +$62,135.25 | synthetic campaign-level months |
| PENFOLD018 | booked | $0 | $53,477.02 | +$53,477.02 | synthetic campaign-level months |
| PENFOLD016 | approved | $0 | $46,186.28 | +$46,186.28 | synthetic campaign-level months |
| BICAU002 | planned | $0 | $45,517.77 | +$45,517.77 | status scope |
| glenda008 | draft | $0 | $36,918.27 | +$36,918.27 | status scope |
| buxton004 | booked | $0 | $35,388.22 | +$35,388.22 | synthetic campaign-level months |
| CHALLEN005 | planned | $0 | $31,818.18 | +$31,818.18 | status scope |
| PENFOLD021 | approved | $0 | $30,709.40 | +$30,709.40 | synthetic campaign-level months |
| curatif004 | approved | $0 | $27,554.00 | +$27,554.00 | synthetic campaign-level months |
| hema007 | approved | $0 | $25,000.00 | +$25,000.00 | synthetic campaign-level months |
| krusty012 | booked | $0 | $25,000.00 | +$25,000.00 | version pool |
| BOSS005 | approved | $0 | $24,933.63 | +$24,933.63 | synthetic campaign-level months |
| BOSS003 | cancelled | $0 | $24,053.96 | +$24,053.96 | status scope |
| QATAR002 | planned | $0 | $23,453.28 | +$23,453.28 | status scope |
| malay004 | planned | $0 | $21,142.86 | +$21,142.86 | status scope |
| krusty001 | draft | $0 | $20,000.00 | +$20,000.00 | status scope (also orphan media) |
| golf023 | approved | $0 | $17,200.00 | +$17,200.00 | synthetic campaign-level months |
| krusty007 | draft | $0 | $16,847.82 | +$16,847.82 | status scope |
| krusty008 | draft | $0 | $16,847.82 | +$16,847.82 | status scope |
| PGAAUS015 | approved | $0 | $16,811.50 | +$16,811.50 | synthetic campaign-level months |
| golf025 | approved | $0 | $16,738.00 | +$16,738.00 | synthetic campaign-level months |
| legal004 | planned | $0 | $16,723.00 | +$16,723.00 | status scope |
| noelj001 | approved | $0 | $15,509.51 | +$15,509.51 | synthetic campaign-level months |
| krusty003 | planned | $0 | $15,000.00 | +$15,000.00 | status scope (also orphan media) |
| OLIGRV001 | cancelled | $0 | $14,500.00 | +$14,500.00 | status scope |
| krusty010 | draft | $0 | $12,500.00 | +$12,500.00 | status scope |
| krusty011 | draft | $0 | $12,500.00 | +$12,500.00 | status scope |
| golf024 | approved | $0 | $10,720.00 | +$10,720.00 | synthetic campaign-level months |
| hartm014 | approved | $0 | $10,000.00 | +$10,000.00 | version pool (also orphan media) |
| PGAAUS016 | approved | $0 | $10,000.00 | +$10,000.00 | synthetic campaign-level months |
| krusty014 | draft | $0 | $10,000.00 | +$10,000.00 | status scope |
| cuheal001 | cancelled | $0 | $8,857.14 | +$8,857.14 | status scope |
| krusty006 | draft | $0 | $8,493.16 | +$8,493.16 | status scope |
| golf026 | approved | $0 | $8,250.00 | +$8,250.00 | synthetic campaign-level months |
| candel002 | cancelled | $0 | $6,400.00 | +$6,400.00 | status scope (also orphan media) |
| BOSS004 | cancelled | $0 | $1,164.65 | +$1,164.65 | status scope |
| hartm001 | booked | $113,762.68 | $114,282.04 | +$519.36 | fee-adserving inclusion |
| candel001 | approved | $15,600.00 | $16,100.00 | +$500.00 | synthetic campaign-level months |

**Totals:** Legacy AP $344,721.36 · Sections full $2,391,932.93 · Δ +$2,047,211.57  
Sections media-attributed-only $639,088.93 · Δ vs legacy +$294,367.57 (status + version pool + orphans; fee/ads stripped).

### Campaign-level `__service__*` by `campaign_status` (sections, no filter)

| Status | MBAs | Amount |
|--------|------|--------|
| approved | 18 | $1,293,490.70 |
| draft | 7 | $269,876.30 |
| booked | 3 | $89,384.60 |
| planned | 3 | $77,410.95 |
| cancelled | 3 | $15,681.45 |

(Claude’s draft/planned/cancelled service figures were the same class; live counts differ slightly by MBA set / all-component vs media-only service slice.)

---

## 3. STATUS SCOPING (legacy code)

### Version pool (no status filter)

`lib/finance/relevantPlanVersions.ts` `selectRelevantVersionsForMonth` **58–81**: latest master `version_number` + campaign date overlap. **No `campaign_status` gate.**

### Billing API (`/api/finance/billing`)

- `includeNonBooked = searchParams.get("include_drafts") !== "0"` — **billing/route.ts:142** (single-month), **:211** (multi-month).
- When `include_drafts=0`: `filterPlanVersionsByIncludeDrafts` / derive keep **booked | approved | completed** only — **filterBillingRecords.ts:86–95**; receivables also gate at **deriveReceivableRecords.ts:127–130**.
- Hub UI default: `useFinanceStore` **`includeDrafts: false`** (**useFinanceStore.ts:174**) → client sends `include_drafts=0`.

### Payables API (`/api/finance/payables`)

- Same drafts flag: **payables/route.ts:111** (single), **:179** (multi).
- Then `composePayableRecordsForMonth` → `filterPlanVersionsByIncludeDrafts` (**composeFinanceHubRecords.ts:203**) → same **booked | approved | completed** when drafts off.
- **Composition = media only:** `derivePayableRecords` + `agencyOwedDeliveryMediaTotal` / `payablesFromDeliveryMonth` (**scheduleMonthFinanceExtract.ts:151–200**) — delivery line media, skip `production` mediaKey, exclude client-pays; **fee/adserving not in payable line totals**.

### Does status explain receivables −$658.93?

**No — version pool / tip / materialisation does** (see `fn-fix-1-receivables-recon-dispositions-2026-08-01.md`).

Evidence:

1. Sections billing-by-status in this window includes **draft $343,119.57** (10 MBAs), **planned $216,618.07**, **cancelled $70,215.05**. If the −$658.93 recon had compared hub UI (`include_drafts=0`) to unfiltered sections, the delta would be **hundreds of thousands**, not $658.
2. The matching −$658.93 recon’s legacy side uses a **booked/approved/completed preference with fallback to highest ≤published** (recon script), so draft-only tips still enter when no live tip exists — same economic population class as sections’ published tips for those MBAs.
3. Prior per-MBA dispositions attribute the residual to **D1 version pool / tip / empty `schedule_months`**, not status.

---

## 4. ONE-LINE DECISIONS (Luke)

**Status set:** Sections summary / costs / investment cut / agency economics use **`approved` + `booked` + `completed` only**; exclude `draft` / `planned` / `cancelled`; surface excluded-status $ totals in coverage meta (do not silent-drop).

**Costs / payables composition:** Legacy payables = **media only** (ex client-pays; fee/adserving out of line totals). **Recommend Costs payables KPI = media only** to match hub meaning; keep fee + adserving in coverage / campaign-level breakdown (not the payables headline). Media+fee+adserving remains a valid “gross booked delivery cost” alternate — label it separately if shown.

---

## 5. Out of scope this commit

- No status filter implementation.
- Costs `PayablesReconBanner` retained.
- Orphan `$83,593.95` join cleanup = separate data/join debt (not status).
