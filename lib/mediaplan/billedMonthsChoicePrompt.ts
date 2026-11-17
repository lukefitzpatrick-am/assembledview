/**
 * S2 A: the plan pages' billed months question. `postPlansSave` asks it when
 * the save route answers 409 BILLED_MONTHS_CHOICE_REQUIRED; the dialog host
 * on each plan page answers. No host mounted: no answer, the save stops.
 */
import type { BilledMonth, BilledMonthsChoice } from "@/lib/finance/billedMonths/choice"

type Chooser = (months: BilledMonth[]) => Promise<BilledMonthsChoice | null>

let chooser: Chooser | null = null

/** The dialog host registers itself; the returned function unregisters it. */
export function registerBilledMonthsChooser(fn: Chooser): () => void {
  chooser = fn
  return () => {
    if (chooser === fn) chooser = null
  }
}

export function chooseBilledMonths(months: BilledMonth[]): Promise<BilledMonthsChoice | null> {
  return chooser ? chooser(months) : Promise.resolve(null)
}
