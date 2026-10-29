/**
 * TRUE_UP flag (true-up Stage 1, the read-only report). Default off.
 *
 * - Server: TRUE_UP=on gates the page and GET /api/finance/reports/true-up.
 * - Browser: NEXT_PUBLIC_TRUE_UP=on shows the "True-up" link on the Plan
 *   reconciliation page. It is inlined at build time, so a change needs a deploy.
 * Turn both on together. Fixes come later behind TRUE_UP_ACTIONS.
 */

function isOn(raw: string | undefined): boolean {
  const v = String(raw ?? "off").trim().toLowerCase()
  return v === "on" || v === "1" || v === "true"
}

export function isTrueUpEnabled(): boolean {
  return isOn(process.env.TRUE_UP)
}

export function isTrueUpUiEnabled(): boolean {
  return isOn(process.env.NEXT_PUBLIC_TRUE_UP)
}
