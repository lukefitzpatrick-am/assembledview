/**
 * Join `schedule_months` → `line_items` on published tip.
 *
 * `schedule_months.line_item_id` is often the schedule key `billing-{mediaType}::{lineId}`
 * while `line_items.line_item_id` stores the bare `{lineId}`. Match either exact or
 * the suffix after `::`. Never invent rows — unmatched schedule cells stay without li.
 */
export const SCHEDULE_LINE_JOIN_SQL = `
li.version_id = v.id
AND (
  li.line_item_id = sm.line_item_id
  OR (
    POSITION('::' IN sm.line_item_id) > 0
    AND li.line_item_id = SPLIT_PART(sm.line_item_id, '::', 2)
  )
)
`.trim()
