/**
 * Server half of fixed cost from a date (B23) on the save route: the switch
 * read and the gate. Rules live in `lib/mediaplan/fixedCostFrom.ts`.
 */
import "server-only"

import { isFeatureOn } from "@/lib/features/server"
import {
  fixedCostFromGateResult,
  type FixedCostFromGateResult,
} from "@/lib/mediaplan/fixedCostFrom"

export type FixedCostFromSaveDeps = { isOn: () => Promise<boolean> }

const defaultDeps: FixedCostFromSaveDeps = { isOn: () => isFeatureOn("fixed_cost_from_date") }

/**
 * Off, or a draft: no check. A failed switch read is off (logged): the line
 * keeps its date and the readers ignore it until the switch reads on.
 */
export async function fixedCostFromGateForSave(
  mode: "draft" | "new_version" | "publish",
  lineItems: Parameters<typeof fixedCostFromGateResult>[1],
  deps: FixedCostFromSaveDeps = defaultDeps,
): Promise<FixedCostFromGateResult> {
  if (mode === "draft") return { reject: false }
  let enabled = false
  try {
    enabled = await deps.isOn()
  } catch (err) {
    console.warn("[plans/save] fixed_cost_from_date switch read failed; date not checked", err)
  }
  return fixedCostFromGateResult(mode, lineItems, enabled)
}
