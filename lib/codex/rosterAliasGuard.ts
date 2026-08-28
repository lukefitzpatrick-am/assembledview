/**
 * Roster email-alias occupancy: never silently pick a holder.
 * Existing collisions are reported, not resolved.
 */

export type AliasHolder = {
  email: string
  name: string
}

export type AliasRosterRow = {
  email: string
  name: string
  aliases?: string[] | null
  active?: boolean
}

export type AliasCollision = {
  alias: string
  holders: AliasHolder[]
}

export class AliasCollisionError extends Error {
  readonly code = "alias_collision"
  readonly alias: string
  readonly holder: AliasHolder

  constructor(alias: string, holder: AliasHolder) {
    super(
      `${alias} already belongs to ${holder.name} (${holder.email}).`
    )
    this.name = "AliasCollisionError"
    this.alias = alias
    this.holder = holder
  }
}

function isActive(row: AliasRosterRow): boolean {
  return row.active !== false
}

function addressesOf(row: AliasRosterRow): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (raw: string | null | undefined) => {
    const email = String(raw ?? "").trim().toLowerCase()
    if (!email || !email.includes("@") || seen.has(email)) return
    seen.add(email)
    out.push(email)
  }
  add(row.email)
  for (const alias of row.aliases ?? []) add(alias)
  return out
}

function holderOf(row: AliasRosterRow): AliasHolder {
  return {
    email: row.email.trim().toLowerCase(),
    name: row.name.trim() || row.email.trim().toLowerCase(),
  }
}

export function findActiveHoldersOfAlias(
  alias: string,
  roster: readonly AliasRosterRow[],
  excludeEmail?: string
): AliasHolder[] {
  const needle = alias.trim().toLowerCase()
  if (!needle) return []
  const skip = excludeEmail?.trim().toLowerCase() ?? ""
  const holders: AliasHolder[] = []
  const seen = new Set<string>()
  for (const row of roster) {
    if (!isActive(row)) continue
    const email = row.email.trim().toLowerCase()
    if (skip && email === skip) continue
    if (!addressesOf(row).includes(needle)) continue
    if (seen.has(email)) continue
    seen.add(email)
    holders.push(holderOf(row))
  }
  return holders
}

export function assertNewAliasesAvailable(
  aliases: readonly string[],
  roster: readonly AliasRosterRow[],
  ownerEmail?: string
): void {
  for (const raw of aliases) {
    const alias = raw.trim().toLowerCase()
    if (!alias) continue
    const holders = findActiveHoldersOfAlias(alias, roster, ownerEmail)
    if (holders.length > 0) {
      throw new AliasCollisionError(alias, holders[0]!)
    }
  }
}

export function dropCollidingNewAliases(
  aliases: readonly string[],
  roster: readonly AliasRosterRow[],
  ownerEmail?: string
): {
  accepted: string[]
  refused: Array<{ alias: string; holder: AliasHolder }>
} {
  const accepted: string[] = []
  const refused: Array<{ alias: string; holder: AliasHolder }> = []
  const seen = new Set<string>()
  for (const raw of aliases) {
    const alias = raw.trim().toLowerCase()
    if (!alias || seen.has(alias)) continue
    seen.add(alias)
    const holders = findActiveHoldersOfAlias(alias, roster, ownerEmail)
    if (holders.length > 0) {
      refused.push({ alias, holder: holders[0]! })
      continue
    }
    accepted.push(alias)
  }
  return { accepted, refused }
}

export function listAliasCollisions(
  roster: readonly AliasRosterRow[]
): AliasCollision[] {
  const byAddress = new Map<string, AliasHolder[]>()
  for (const row of roster) {
    if (!isActive(row)) continue
    const holder = holderOf(row)
    for (const address of addressesOf(row)) {
      const holders = byAddress.get(address) ?? []
      if (!holders.some((h) => h.email === holder.email)) {
        holders.push(holder)
      }
      byAddress.set(address, holders)
    }
  }
  const collisions: AliasCollision[] = []
  for (const [alias, holders] of byAddress) {
    if (holders.length < 2) continue
    collisions.push({
      alias,
      holders: holders.toSorted((a, b) => a.email.localeCompare(b.email)),
    })
  }
  return collisions.toSorted((a, b) => a.alias.localeCompare(b.alias))
}
