# DESIGN: Xero invoice grain per client, PO register and the matcher (22 Oct 2026)

Status: design only. No migration applied. No code changed by this doc.
Draft migration: `db/migrations/drafts/DRAFT_xero_invoice_grain_2026-10-22.sql` (wrapped in `BEGIN ... ROLLBACK`, not numbered, nothing reads that folder).
Inputs: `docs/superpowers/DISCOVERY-xero-drafts-and-invoice-lines.md` (Q3, Q8, Q8b), plan `PLAN-AV-xero-drafts-and-finance-process-2026-10-21`, live Supabase reads on 22 Oct.

Luke's decisions applied (22 Oct):
- D1 drafts only, later. D2-3 CSV first, push later.
- D3 grain is per client. G1 to G4 options plus arbitrary client-defined PO splits.
- Penfolds' PO split comes from the client, on their terms.
- D4 $0 bonus lines stay off invoices. D5 any admin. D7 PO in the Reference, MBA last in brackets.
- Plan of record for billing is `schedule_months`, not the version blob.

---

## 1. What the live data says

**PENFOLD016, September 2026.** One MBA-month, five Xero invoices, one PO each. Each PO is one supplier. The five sum to the AV record to the cent.

| Supplier (schedule_months, billing) | AV $ | Xero invoice | PO | Xero $ |
|---|---|---|---|---|
| Broadsheet (DD2, DD4, DD5) | 6,000.00 | INV-1500 | 984523 | 6,000.00 |
| Cartology (OH1) | 1,982.14 | INV-1496 | 1010437 | 1,982.14 |
| Channel Factory (PV1) | 3,000.00 | INV-1499 | 1010441 | 3,000.00 |
| Jolt (OH4, OH5) | 1,428.57 | INV-1497 | 1010438 | 1,428.57 |
| oOh! media (OH7 to OH9) | 1,835.01 | INV-1498 | 1010440 | 1,835.01 |
| **Total** | **14,245.72** | 5 invoices | | **14,245.72** |

Today the matcher stamps none of the five. The record `media:PENFOLD016:2026-09` is stamped `differs` to **INV-1422 ($4,571.43)**, which is the same amount as the **August** Jolt line (OH4, OH5 $4,571.43). The plus-or-minus-one-month window let an August invoice land on the September record. The record cannot hold five invoices, and the window picks the wrong one.

`media:PENFOLD015:2026-09` is stamped `differs` to INV-1464 (Bin 707, $100,000), which is not a September plan line at all.

**PENFOLD015, September 2026.** AV record $156,704.14. Six suppliers.

| Supplier | AV $ | Xero | PO | Xero $ |
|---|---|---|---|---|
| QMS | 56,400.00 | INV-1489 | 1005372 | 56,400.00 |
| JCDecaux | 38,518.72 | INV-1490 | 1005374 | 38,518.72 |
| oOh! media OOH + production (PROD1 $337.08) | 15,513.93 | INV-1491 (3 lines) | 1005376 | 15,513.93 |
| Cartology | 14,366.57 | INV-1493 | 1005380 | 14,366.57 |
| Channel Factory | 21,428.57 | INV-1494 | 1010433 | 21,428.57 |
| Jolt | 10,476.35 | none found | ? | - |
| (not in the September plan) "Bin 707 amplification" | - | INV-1464 PAID, ref `PENFOLD015- Bin 707 amplification \| PO1017399` | 1017399 | 100,000.00 |

What this shows:
- Penfolds' PO grain is **supplier within MBA** in these two months (G2 shape, with a PO per supplier). 95% confident for these two MBAs. Not confirmed as their rule.
- **Production goes on the supplier's PO**, not on a separate fee or production invoice (INV-1491 carries the oOh! P&I line). 90% confident.
- One PO can be **outside the plan lines** (Bin 707, $100,000). That is an arbitrary client-defined split, and it is why the register needs explicit line lists, not only supplier rules.
- Jolt's $10,476.35 has no invoice with a PENFOLD015 reference in Sep or Oct. Either not raised, or raised with a different Reference. Question Q11.
- Accounts write the PO after a pipe: `... (PENFOLD015) | 1005372`. The tokeniser reads the MBA from that today (XD-0 Q8).

---

## 2. Shape of the change

Three layers. Each is additive. `finance_billing_records` and `invoice_key` keep their meaning.

```
finance_billing_records          one row per client x MBA x month (unchanged)
  invoice_key = media:{mba}:{YYYY-MM}   (unique, unchanged)
        |
        | 1..n  (G1: 1, G2/G3: n)         n..1 (G4: many records, one invoice)
        v
finance_planned_invoices         one row per invoice AV expects in Xero
  planned_invoice_key            unique while live
  po_number, reference, expected_cents
  matched_xero_invoice_id        unique while live (one Xero invoice, one plan)
        |
        | 1..n
        v
finance_planned_invoice_lines    which record and which plan lines, in cents
```

Rules that decide the planned invoices:

```
client_invoice_grain (client_id -> G1|G2|G3|G4, effective_from_month)
client_purchase_orders (client, PO, scope: MBA | MBA+supplier | explicit lines, cap)
client_purchase_order_lines (PO -> explicit line ids, optional month and part amount)
```

### 2.1 Why not widen `invoice_key`

The discovery offered `media:{mba}:{YYYY-MM}:{split}` as option one. I recommend against it. 85% confident.
- `invoice_key` is read by approve, unapprove, send-to-accounts, the overlay, the matcher, clearance, invoiced-vs-expected and the plan reconciliation check. Splitting the record splits every one of those.
- The approved snapshot (`approved_amount_cents`, `approved_lines_hash`) is per MBA-month. FP-2a reconciles at that grain to `schedule_months`. That grain is right for "did we bill the plan". The PO grain is only about "how many pieces of paper".
- G4 (consolidated) cannot be expressed as a suffix on one record at all.

So the record stays the money truth per MBA-month. Planned invoices are the paper. The sum of a record's planned-invoice lines must equal its approved cents, to the cent (check in code at approve, and in FP-2a as a new reason `planned_invoices_ne_record`).

### 2.2 Grain options

| Grain | Planned invoices per record | planned_invoice_key | PO on the invoice | Typical client |
|---|---|---|---|---|
| G1 (default, no row) | 1 | `media:{mba}:{m}#all` | version `po_number` if real (not TBC, N/A, blank) | most clients |
| G2 | one per supplier | `media:{mba}:{m}#s:{supplier_key}` | the PO registered for (MBA, supplier), else version PO | Penfolds as seen in Sep |
| G3 | one per PO | `media:{mba}:{m}#po:{po}` | that PO | clients whose POs cut across suppliers |
| G4 | one per client-month over all MBAs | `client:{id}:{m}#all` | client-wide PO if registered | consolidated billers |

G2 and G3 differ only in what drives the grouping (supplier vs PO register). With a PO per supplier, G2 and G3 give the same invoices. Penfolds can run as G3 with supplier-scoped POs, which also handles the Bin 707 case (explicit line list). Recommendation: **build G1 and G3 first; G2 is G3 with "one PO per supplier" auto-suggested; G4 last.** 80% confident.

### 2.3 Line placement (G3), most specific wins

For each billable line on the record (media lines from `schedule_months`, plus fee, ad serving, production service lines):
1. An explicit `client_purchase_order_lines` row for (MBA, line id, month or any month). If `amount_cents` is set, only that part moves; the rest falls through.
2. A PO scoped to (MBA, supplier_key) where the line's supplier matches. Supplier key is the same normalised value FP-1 uses for the descriptor supplier (`attrs.network` for OOH, `publisher` or `attrs.network` for press, `platform` for search/social/prog, and so on).
3. A PO scoped to the MBA only.
4. A client-wide PO (no MBA).
5. Nothing: `client_invoice_grain.unassigned_line_rule` decides: `block` (blocker in the batch, default) or `own_invoice` (a `#unassigned` planned invoice with no PO).

Service lines (fee, ad serving, production): **Q4.** The PENFOLD015 evidence puts production on the supplier's PO. The fee has no supplier. Options: fee on its own invoice, spread by media share across PO invoices, or a registered fee PO. Until Luke says, fee and ad serving go to rule 3/4/5, and per-line production (`...PROD1` rows) uses its line's supplier.

PO validity: `month_from`/`month_to` and `status = 'open'`. Cap: if `amount_cap_cents` is set and the sum of live planned invoices on the PO would exceed it, the batch shows a blocker `po_cap_exceeded` (it does not split or trim). That is the hook for Sam's drawdown tracking (FP-10), not the whole of it.

### 2.4 When planned invoices are written

- **Built at read time** for the To bill preview and the FP-3 CSV preview, from the composed record + grain + register. Pure function, no I/O: `planInvoicesForRecord(record, lines, grain, register) -> PlannedInvoice[]`.
- **Persisted at approve**, in the same transaction as the record snapshot. Re-approve marks the old rows `superseded` and writes new ones (unique index is partial on `status <> 'superseded'`).
- **Stale** when FP-5's late-change warning fires (publish after export or push).
- FP-3 CSV: one invoice per planned invoice, `InvoiceNumber` blank, Reference from the planned invoice.
- FP-4 push: one Xero draft per planned invoice; `pushed_xero_invoice_id` and `matched_xero_invoice_id` set by construction.

### 2.5 Reference (D7)

`PO {po} ({MBA})` when a real PO exists, else `({MBA})`. G4: `PO {po} (CLIENT-{YYYY-MM})` is **not** parseable by the current tokeniser as a client token. **Q6.** Proposal: G4 references list every MBA in brackets, `PO 123 (BICAU002) (BICAU006)`; the tokeniser already returns every token, but `matchMbaAgainstMasters` returns the first hit. The matcher change below handles a multi-MBA reference only for G4.

PO placeholder rule: `TBC`, `N/A`, `NA`, `TBA`, blank, and the known test values (`kpi test`, `test 4`) never print. 90% confident that is the full list on 22 Oct (XD-0 Q8 counts).

---

## 3. Matcher change (XL-4)

Today (`lib/finance/sections/xeroBillingMatch.ts`): invoice -> Reference token -> open records for that MBA within plus or minus one month -> one record (`stampOne`) or a sum of records (`sumStamp`). A stamped record leaves the pool (`used`). Result: one record holds one invoice. Many records to one invoice works. One record to many invoices does not.

### 3.1 Target rule

Match **Xero invoices to planned invoices**, then roll up to records.

```ts
// new, pure, beside the current matcher
export type PlannedInvoiceMatchRow = {
  plannedInvoiceKey: string
  clientId: number
  mbaNumbers: string[]          // 1 for G1-G3, n for G4
  billingMonth: string
  poNumber: string | null
  expectedCents: number
  matchedBy?: string | null     // 'manual' rows are not candidates
}

export function matchXeroInvoicesToPlannedInvoices(input: {
  invoices: XeroBillingMatchInvoice[]
  planned: PlannedInvoiceMatchRow[]
  masters: MbaMaster[]
  scopes?: ScopeOfWorkRef[]
}): PlannedInvoiceMatchDecision[]
```

For each live invoice (DRAFT, SUBMITTED, AUTHORISED, PAID; DELETED and VOIDED unlink, as today):
1. **By construction (FP-4):** a planned invoice whose `pushed_xero_invoice_id` equals the InvoiceID. Stamp. Done.
2. **Tokens:** tokenise the Reference as today (`TOKEN_RE`). A token that equals an MBA or scope id is an MBA token (as today). A token that, after stripping a leading `PO`, `PO#` or `#`, equals a **registered PO number for the invoice's linked client** (or for any client when the contact is unlinked) is a PO token. Look-up, not a regex. Why: live references put the MBA after the pipe as often as the PO (`... | BICAU006`, `... | 001001`, `... | Sinch001 | Cost Centre: 301`), so "digits after the last pipe" would read MBA `001001` as a PO. Live forms the look-up must handle (Jul to Oct 2026): `| 1005372`, `|  1005369` (two spaces), `| PO 1005369`, `| PO# 1018151`, `| PO1017399`, `|` (empty), and PO-only references with no MBA (`Media Buy 1 | PO 1005377`). 85% confident.
3. **Pool:** open planned invoices with the MBA token (or, with a PO token and no MBA token, planned invoices carrying that PO), billing month within plus or minus one of the issue month, exact month preferred (same window rule as today).
4. If a PO token exists, filter the pool to `poNumber` equal (normalised: strip `PO`, `#`, spaces, leading zeros kept).
5. One candidate: stamp, `auto_adopted` within $1 ex-GST, else `differs`.
6. Several candidates and no PO token: stamp the one whose `expectedCents` is within $1 **only if exactly one is**. Else suggestion `ambiguous`. (No summing across planned invoices: a planned invoice is one piece of paper by definition.)
7. No MBA token: client link plus amount, one candidate within $1, as today.

Roll-up per record (new, pure): `recordXeroCoverage(record, plannedForRecord, decisions)`:
- `matched` when every live planned invoice of the record is stamped.
- `partly matched (k of n)` otherwise.
- Record-level `drift`: sum of stamped Xero sub_totals minus the record's approved cents. Within $1 is `auto_adopted`; else `differs`.
- G1 keeps writing `finance_billing_records.matched_xero_invoice_id` (one invoice), so every current reader keeps working. G2 to G4 leave it null and the readers move to the roll-up. **This is a reader change for: overlay `needsAttention`, clearance, invoiced-vs-expected, In Xero page, send-to-accounts lifecycle.** 75% confident that list is complete; a BLAST-RADIUS pass is part of the build prompt.

### 3.2 Transition (no planned invoices persisted yet)

Until approve writes planned invoices, the nightly match keeps the current record matcher for G1 clients and, for clients with a grain row, builds planned invoices at read time from the record and the register (2.4) and runs 3.1 against them. Stamps for those clients go to `finance_planned_invoices` rows created lazily by the match stage (status `matched`). The current record matcher must **skip records of non-G1 clients**, so it stops stamping one of five invoices as `differs`.

### 3.3 Back-fill

PENFOLD015 and PENFOLD016 September can be back-filled once Penfolds' grain and POs are entered: the five PENFOLD016 invoices match by PO token and sum to $14,245.72. That back-fill is a manual SQL file for Luke (single DO block, guarded counts), written after the migration is applied, not now.

---

## 4. PO register

- Who enters POs: any admin (D5), in the AV finance section, on a "Purchase orders" panel per client (a tab next to the finance owner tab, D6). Import from Sam's TWE Excel is a later step (Q8).
- Scope per PO: MBA, MBA + supplier, explicit lines, or client-wide. Months optional. Cap optional.
- The register replaces `media_plan_versions.po_number` only for clients with a grain row. G1 clients keep the version PO. **Q5:** should a registered MBA-scoped PO override the version PO for G1 too?
- Uniqueness: `(client, po, MBA or blank, supplier or blank)`. A client can reuse a PO across suppliers inside one MBA (PENFOLD015 PO 1005376 covers oOh! OOH and oOh! production); that is one supplier key, so it is one row.

---

## 5. Draft migration (summary)

File: `db/migrations/drafts/DRAFT_xero_invoice_grain_2026-10-22.sql`. Not applied. Not numbered. Ends in `ROLLBACK`.

| Table | Purpose | Key constraints |
|---|---|---|
| `client_invoice_grain` | grain per client, from a month | PK `client_id`; grain in G1..G4 |
| `client_purchase_orders` | the PO register | unique `(client_id, po_number, lower(mba), supplier_key)`; supplier needs MBA; cap >= 0 |
| `client_purchase_order_lines` | explicit line lists and part amounts | unique `(po, lower(mba), line_item_id, coalesce(month,'*'))` |
| `finance_planned_invoices` | one row per expected Xero invoice | partial unique on `planned_invoice_key` and on `matched_xero_invoice_id` where not superseded |
| `finance_planned_invoice_lines` | record + lines + cents per planned invoice | FK to the record and the planned invoice |

Not in the draft, added when numbered: Ava read policies (as 0011), `db/schema` mirror, drizzle snapshot, `updated_at` triggers if the house pattern needs them.

---

## 6. Build order (prompts after Luke's answers)

1. **XG-1** Apply the numbered migration (Luke). Hand-sync `db/schema`. No behaviour change.
2. **XG-2** Pure `planInvoicesForRecord` + tests over PENFOLD015/016 September fixtures (the tables in section 1), G1 equivalence test (every current client gives one planned invoice equal to the record).
3. **XG-3** PO register and grain tab (admin), behind the finance section. Read and write only those two tables.
4. **XG-4** Matcher: PO token, `matchXeroInvoicesToPlannedInvoices`, roll-up, skip non-G1 in the record matcher. Tests: the five PENFOLD016 invoices stamp five planned invoices and roll up to `matched`, delta 0.
5. **XG-5** Reader moves (overlay, clearance, invoiced-vs-expected, In Xero) to the roll-up for non-G1.
6. FP-3 CSV and FP-4 push consume planned invoices.

---

## 7. Questions for Luke

1. **Q1 Penfolds' rule in words.** Is it one PO per supplier per MBA (what September shows), or per supplier per month, or something else? Who sends the POs and when (before the 17th plan sign-off?).
2. **Q2 Other clients.** Which other clients need a grain other than G1 today (TWE brands: Pepper Jack, Squealing Pig, Treasury Wine Collective)? Any G4 (consolidated) client?
3. **Q3 Bin 707 ($100,000, PO 1017399).** Which plan does it belong to? It is not in PENFOLD015's September billing rows. Is it a separate MBA or scope, a pre-bill, or a drawdown on the commission bank?
4. **Q4 Fee and ad serving under G3.** Own invoice, spread across the PO invoices, or a registered fee PO?
5. **Q5 Version PO for G1 clients.** Keep `media_plan_versions.po_number` as the G1 source, or move every PO into the register?
6. **Q6 G4 Reference.** Is listing every MBA in brackets acceptable to accounts and clients?
7. **Q7 Supplier key.** Use the FP-1 descriptor supplier (needs your descriptor comp), or the raw `publisher`/`attrs.network`/`platform`?
8. **Q8 Sam's TWE Excel.** Needed to model caps, drawdowns, pre-bills and the commission bank. The draft has a cap only.
9. **Q9 Part-line splits.** Does any client split one plan line across two POs? The draft allows a fixed amount per line per month. If never, drop `amount_cents`.
10. **Q10 Unassigned lines.** Block the batch (draft default) or raise them on a no-PO invoice?
11. **Q11 PENFOLD015 Jolt $10,476.35 (September).** No invoice with a PENFOLD015 reference in Sep or Oct. Not raised yet, or raised under another Reference?
12. **Q13 Month window.** The current plus-or-minus-one-month window stamped August's Jolt invoice ($4,571.43) on PENFOLD016 September. For planned invoices with a PO token, should the window be exact month only (proposal), keeping plus or minus one only for references with no PO?
13. **Q12 Andrew's template and Xero connection facts** (still missing). They decide the CSV columns and whether one planned invoice can carry several tracking categories.

Confidence in this design overall: **75%**, capped by Q1, Q3 and Q4. The record-stays-parent choice: 85%. The matcher rule: 80% (the PO look-up needs a test over every live reference since Jul 2026).
