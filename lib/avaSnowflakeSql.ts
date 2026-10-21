/** Pure SQL for lib/avaSnowflake.ts. No Snowflake client here, so tests can import it. */

export const NON_SOCIAL_PACING_FACT = "ASSEMBLEDVIEW.MART.PACING_FACT"

/**
 * One facts query. PACING_FACT still holds legacy "Social - Meta" and
 * "Social - TikTok" rows that duplicate SOCIAL_PACING_FACT, so a PACING_FACT
 * read always leaves social channels out. Social figures come only from
 * SOCIAL_PACING_FACT.
 */
export function avaFactsSql(selectClause: string, table: string, whereClause: string): string {
  const guard = table === NON_SOCIAL_PACING_FACT ? ` AND CHANNEL NOT ILIKE 'Social%'` : ""
  return `${selectClause} FROM ${table} ${whereClause}${guard}`
}
