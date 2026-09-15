/** Plan code from a Channel Factory Media Buy Name. Not last-underscore split. */
const PLAN_CODE_RE = /[A-Za-z]{3,}[0-9]{3}PV[0-9]+/i

export function extractPlanCode(mediaBuyName: string | null | undefined): string | null {
  const text = String(mediaBuyName ?? "")
  const match = text.match(PLAN_CODE_RE)
  if (!match) return null
  return match[0].toLowerCase()
}
