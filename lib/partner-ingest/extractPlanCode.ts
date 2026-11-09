/**
 * Plan code from a Channel Factory Media Buy Name or a Vistar Contract Number.
 * Not last-underscore split. `PV` is a video buy, `PO` an out-of-home buy.
 */
const PLAN_CODE_RE = /[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+/i

/**
 * Channel Factory also accepts `DV`: a Direct Booked Digital Video line
 * (`lineItemIds.ts` `digitalVideo`). Vistar keeps `PLAN_CODE_RE` (HF1).
 */
const CHANNEL_FACTORY_PLAN_CODE_RE = /[A-Za-z]{3,}[0-9]{3}(?:P[VO]|DV)[0-9]+/i

function matchPlanCode(text: string | null | undefined, re: RegExp): string | null {
  const match = String(text ?? "").match(re)
  if (!match) return null
  return match[0].toLowerCase()
}

export function extractPlanCode(mediaBuyName: string | null | undefined): string | null {
  return matchPlanCode(mediaBuyName, PLAN_CODE_RE)
}

/** Channel Factory Media Buy Name: `PV`, `PO` or `DV` plan code, lowercased. */
export function extractChannelFactoryPlanCode(mediaBuyName: string | null | undefined): string | null {
  return matchPlanCode(mediaBuyName, CHANNEL_FACTORY_PLAN_CODE_RE)
}
