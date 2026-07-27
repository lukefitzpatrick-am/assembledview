/**
 * Bucket math for appendNewMediaTypeIntoWorkingMonth on the edit page.
 *
 * C1 schedules often already carry mediaCosts[mediaKey] with empty lineItems.
 * Seeding must **replace** the bucket from template line sums (not prior+sum),
 * otherwise mediaTotal doubles vs columns. bucketDelta = next − prior still
 * drives the month mediaTotal rollup so multi-type months accumulate correctly.
 */
export function computeAppendNewMediaTypeBucket(
  priorBucket: number,
  sumNewLines: number
): { nextBucket: number; bucketDelta: number } {
  const nextBucket = sumNewLines
  return { nextBucket, bucketDelta: nextBucket - priorBucket }
}

/**
 * Sum of template line monthly amounts for a month. Multiple lines/bursts of the
 * same media type must all contribute — never collapse to a single line.
 */
export function sumTemplateLinesForMonth(
  templateItems: Array<{ monthlyAmounts?: Record<string, number> }>,
  monthYear: string
): number {
  return templateItems.reduce((s, t) => s + (t.monthlyAmounts?.[monthYear] || 0), 0)
}
