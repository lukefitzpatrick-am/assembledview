/**
 * PC4 — audit collision worksheet decisions to finance_edits.
 */

import { writeStatusChangeEdit, type AuditContext } from "@/lib/finance/writeFinanceAuditEdits"
import type { CollisionDecision } from "@/lib/billing/collisionWorksheet"

export async function writeCollisionDecisionEdits(
  choices: { lineItemId: string; decision: CollisionDecision; oldTotal: number; newTotal: number }[],
  context: Pick<AuditContext, "editedBy" | "editedByName">
): Promise<number> {
  let ok = 0
  for (const c of choices) {
    const wrote = await writeStatusChangeEdit(
      {
        finance_billing_records_id: null,
        field_name: `collision:${c.lineItemId}`,
        old_value: String(c.oldTotal),
        new_value: `${c.decision}:${c.newTotal}`,
      },
      {
        editedBy: context.editedBy,
        editedByName: context.editedByName,
        recordType: "schedule_patch",
      }
    )
    if (wrote) ok += 1
  }
  return ok
}
