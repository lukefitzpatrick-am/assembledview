/**
 * PACING_FACT channel predicate for `/api/pacing/bulk` non-social query.
 * CASE / ALLOWED_CHANNELS already map Programmatic - OOH; this WHERE must
 * admit those rows or they never leave the warehouse.
 */
export function bulkNonSocialChannelWhere(): string {
  return `(
      (LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%display%')
      OR (LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%video%')
      OR (LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) LIKE '%ooh%')
      OR (LOWER(CHANNEL) LIKE '%ad serving%')
    )`
}
