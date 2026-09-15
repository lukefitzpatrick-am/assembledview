/**
 * Plan code from a Channel Factory Media Buy Name or a Vistar Contract Number.
 * Not last-underscore split. `PV` is a video buy, `PO` an out-of-home buy.
 */
const PLAN_CODE_RE = /[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+/i

export function extractPlanCode(mediaBuyName: string | null | undefined): string | null {
  const text = String(mediaBuyName ?? "")
  const match = text.match(PLAN_CODE_RE)
  if (!match) return null
  return match[0].toLowerCase()
}
