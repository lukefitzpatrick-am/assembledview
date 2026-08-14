/**
 * Grouped Assign dropdown options for /admin/fireflies-unattributed (Fireflies meetings).
 * publishers.id 61 is a trailing-space duplicate of Nine (id 11).
 */

export const EXCLUDED_PUBLISHER_IDS = new Set([61])

export type AssignTargetClient = {
  id: number
  mpClientName: string | null
  mbaidentifier: string | null
}

export type AssignTargetPublisher = {
  id: number
  publisherName: string | null
}

export type AssignTargetOption = {
  value: string
  label: string
  group: "Clients" | "Publishers" | "Other"
}

export function publisherEligibleForAssign(id: number): boolean {
  return Number.isFinite(id) && !EXCLUDED_PUBLISHER_IDS.has(id)
}

export function buildAssignTargetOptions(input: {
  clients: AssignTargetClient[]
  publishers: AssignTargetPublisher[]
}): AssignTargetOption[] {
  const clients = input.clients
    .map((c) => {
      const name = (c.mpClientName ?? "").trim() || `Client ${c.id}`
      const mba = (c.mbaidentifier ?? "").trim()
      return {
        value: `client:${c.id}`,
        label: mba ? `${name} — ${mba}` : name,
        group: "Clients" as const,
        sort: name.toLowerCase(),
      }
    })
    .toSorted((a, b) => a.sort.localeCompare(b.sort, "en"))
    .map(({ sort: _sort, ...opt }) => opt)

  const publishers = input.publishers
    .filter((p) => publisherEligibleForAssign(p.id))
    .map((p) => {
      const name = (p.publisherName ?? "").trim() || `Publisher ${p.id}`
      return {
        value: `publisher:${p.id}`,
        label: name,
        group: "Publishers" as const,
        sort: name.toLowerCase(),
      }
    })
    .toSorted((a, b) => a.sort.localeCompare(b.sort, "en"))
    .map(({ sort: _sort, ...opt }) => opt)

  return [
    ...clients,
    ...publishers,
    { value: "internal", label: "Internal", group: "Other" },
    { value: "new_business", label: "New Business", group: "Other" },
  ]
}
