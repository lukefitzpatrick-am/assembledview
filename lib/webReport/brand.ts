/** Case-insensitive contains. Empty terms leave every query non-brand. */
export function isBrandQuery(query: string, brandTerms: readonly string[]): boolean {
  const haystack = query.toLowerCase()
  for (const term of brandTerms) {
    const needle = term.trim().toLowerCase()
    if (needle && haystack.includes(needle)) return true
  }
  return false
}

export type BrandBucket = "all" | "brand" | "non_brand"

export function queryInBucket(
  query: string,
  brandTerms: readonly string[],
  bucket: BrandBucket,
): boolean {
  if (bucket === "all") return true
  const brand = isBrandQuery(query, brandTerms)
  return bucket === "brand" ? brand : !brand
}
