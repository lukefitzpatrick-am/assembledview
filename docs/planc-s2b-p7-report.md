# S2b-P7 — Balancer in timing editor + keep-shape-plus-delta

**Branch:** `feature/billing-plan-c` (not pushed)  
**Flag:** `NEXT_PUBLIC_PLANC_BALANCER=on`  
**Scope:** Client-only. C2 server gate unchanged.

## Surface note (naming)

The paste named **AlterBillingDialog**. That dialog is the finance-hub grand-total
schedule editor. The per-line “Months $X / line $X”, Reset to auto, and date-basis
keep/reset live on **`LineTimingInlineEditor`** (MBA Adjust timing). Implementation
targets that surface (+ `DateBasisKeepResetDialog`). AlterBillingDialog is unchanged.

## Override payload shape (verified)

`billing_overrides.months` is `MonthAmount[]`:

```ts
{
  month: string   // ISO YYYY-MM
  amount: number
  source?: "auto" | "manual" | "balancing"  // NEW optional (S2b)
}
```

- Persist via `extractOverrideMonthsFromSchedule(..., { balancerMonthIso })`
  stamps the balancer month `source: "balancing"` and other months `source: "manual"`.
- `parseMonths` in `billingOverrides.ts` round-trips `source`.
- `buildRows` → `plan_billing_rows.source = "balancing"` when the override month
  carries `source: "balancing"`.

## Behaviour

| Flag | Timing editor |
|------|----------------|
| off | Editable months, sum gate can show ✗/blocking badge (today) |
| on | Exactly one ⚖ balancer month (read-only residual); Distribute evenly; Move balancer; negative → red + “Negative month — usually wrong”; footer always ✓ |

Date-basis collision (flag on): third option **Keep shape + delta** — manuals preserved,
residual on balancer, preview before confirm. Keep / Reset unchanged.

## Screenshots (markup snapshots)

Vitest snapshots under
`components/billing/__tests__/__snapshots__/LineTimingInlineEditor.balancer.test.tsx.snap`
capture flag-off vs flag-on for `LineTimingInlineEditor` and `DateBasisKeepResetDialog`.

### Flag OFF (excerpt)

- No `⚖`, no “Distribute evenly”, no “Move balancer”
- “Reset to auto” + editable month inputs
- Date-basis dialog: Keep + Reset only

### Flag ON (excerpt)

- `⚖` on balancer month, read-only residual cell
- “Distribute evenly” + “Move balancer” links
- Footer live total always shows ✓
- Date-basis dialog: **Keep shape + delta** + preview list

## Tests

- `lib/finance/__tests__/billingBalancer.test.ts` — math, cent residue, negative, keep-shape+delta sum gate
- `components/billing/__tests__/LineTimingInlineEditor.balancer.test.tsx` — flag off/on snapshots + negative warning
- `buildRows` — `source=balancing` stamps typed rows

## VERIFY

```bash
npx tsc --noEmit
npx vitest run
```
