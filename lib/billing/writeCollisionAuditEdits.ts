/**
 * Browser caller for collision-decision audits.
 * The insert lives in writeCollisionAuditEdits.server.ts behind
 * POST /api/finance/billing/collision-decisions. Identity comes from the
 * session on that route, not from the second argument.
 */

import type { CollisionDecision } from "@/lib/billing/collisionWorksheet"

export async function writeCollisionDecisionEdits(
  choices: { lineItemId: string; decision: CollisionDecision; oldTotal: number; newTotal: number }[],
  _context?: { editedBy: number; editedByName: string }
): Promise<number> {
  if (choices.length === 0) return 0
  const res = await fetch("/api/finance/billing/collision-decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ choices }),
  })
  if (!res.ok) return 0
  const json = (await res.json().catch(() => ({}))) as { written?: unknown }
  return typeof json.written === "number" ? json.written : 0
}
