/** Client-reachable — see the boundary note in `./types`. No db/snowflake here. */
import { factRouteForChannel } from "./channels"
import {
  LINE_ITEM_LABEL_MAP,
  PACING_FACT,
  type RelabelPreview,
} from "./types"

/** Human-readable list of Snowflake writes apply would run. Client-safe. */
export function describeRelabelWrites(preview: RelabelPreview): string[] {
  const route = factRouteForChannel(preview.channel)
  const cols = route.updateLineItemName ? "LINE_ITEM_ID and LINE_ITEM_NAME" : "LINE_ITEM_ID"
  const lines = [
    `UPDATE ${route.table} SET ${cols} = ${preview.lineItemId} (${preview.rowsMoving} rows, ${preview.daysMoving} days, spend ${preview.spendMoving})`,
    `Deactivate any active ${LINE_ITEM_LABEL_MAP} row for ${preview.channel} / ${preview.platformEntityId}`,
    `INSERT ${LINE_ITEM_LABEL_MAP} → ${preview.lineItemId} (IS_ACTIVE = TRUE)`,
  ]
  if (preview.duplicateOldNameDays.length > 0) {
    lines.push(
      `DELETE ${PACING_FACT} CM360 rows on ${preview.duplicateOldNameDays.length} double-count day(s): ${preview.duplicateOldNameDays.join(", ")}`,
    )
  }
  if (preview.dateFrom || preview.dateTo) {
    lines.push(`Date scope ${preview.dateFrom ?? "start"} – ${preview.dateTo ?? "end"}`)
  } else {
    lines.push("Scope: all history")
  }
  return lines
}
