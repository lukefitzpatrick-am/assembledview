/**
 * Resolve structured supply deadlines: publisher_specs columns first,
 * vendored prose parse only when the row is missing or columns are NULL.
 * Runtime never writes lib/specs/mi-library/.
 */

import {
  parseSupplyDeadline,
  type StructuredDeadline,
} from "./parseSupplyDeadline.js"

export type SpecDeadlineColumns = {
  supplyDeadlineMinDays: number | null
  supplyDeadlineMaxDays: number | null
  supplyDeadlineBusinessDays: boolean | null
} | null | undefined

export function structuredDeadlineFromSpecColumns(
  columns: SpecDeadlineColumns,
  prose: string | null | undefined,
  parse: (text: string | null | undefined) => StructuredDeadline | null = parseSupplyDeadline,
): StructuredDeadline | null {
  if (
    columns != null
    && columns.supplyDeadlineMinDays != null
    && columns.supplyDeadlineMaxDays != null
    && columns.supplyDeadlineBusinessDays != null
  ) {
    return {
      min_days: columns.supplyDeadlineMinDays,
      max_days: columns.supplyDeadlineMaxDays,
      business_days: columns.supplyDeadlineBusinessDays,
    }
  }
  return parse(prose)
}
