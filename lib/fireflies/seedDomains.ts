/**
 * Seed client_domains from clients.keyemail / billingemail / website host.
 * Skips assembled domains. Idempotent upsert by (client_id, email_domain).
 */
import { extractEmailDomain, isAssembledDomain } from "./attribution.js"
import { defaultAssembledDomainSet } from "./sync.js"

export type SeedClientRow = {
  id: number
  keyemail: string | null
  billingemail: string | null
  website: string | null
}

export function domainFromWebsite(website: string | null): string | null {
  if (!website?.trim()) return null
  let raw = website.trim().toLowerCase()
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "")
    return host || null
  } catch {
    return null
  }
}

/** Domains obtainable from a clients row (report + seed). */
export function seedableDomainsFromClient(
  row: SeedClientRow,
  assembled: Set<string> = defaultAssembledDomainSet()
): string[] {
  const domains = new Set<string>()
  for (const email of [row.keyemail, row.billingemail]) {
    const d = email ? extractEmailDomain(email) : null
    if (d && !isAssembledDomain(d, assembled)) domains.add(d)
  }
  const web = domainFromWebsite(row.website)
  if (web && !isAssembledDomain(web, assembled)) domains.add(web)
  return [...domains].sort()
}

export type SeedDomainPair = { clientId: number; emailDomain: string }

export function collectSeedDomainPairs(
  rows: SeedClientRow[],
  assembled: Set<string> = defaultAssembledDomainSet()
): SeedDomainPair[] {
  const out: SeedDomainPair[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const domain of seedableDomainsFromClient(row, assembled)) {
      const key = `${row.id}:${domain}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ clientId: row.id, emailDomain: domain })
    }
  }
  return out
}
