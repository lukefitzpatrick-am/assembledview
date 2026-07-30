/**
 * 14th pre-run sweep → one notification card payload.
 */

export type PreRunBlocker = {
  kind: "missing_abn" | "missing_legal_name" | "missing_po" | "unapproved_scheduled"
  clientId?: number
  clientName?: string
  mbaNumber?: string
  lineItemId?: string
  owner?: string
  detail: string
}

export type PreRunNudge = {
  kind: "retainer_unchanged_12m" | "reference_hit_rate"
  detail: string
  value?: number
}

export type PreRunSweepCard = {
  periodMonth: string
  blockers: PreRunBlocker[]
  nudges: PreRunNudge[]
  hardBlockerCount: number
}

export function buildPreRunSweepCard(args: {
  periodMonth: string
  blockers: PreRunBlocker[]
  nudges?: PreRunNudge[]
  referenceHitRate?: number | null
}): PreRunSweepCard {
  const blockers = args.blockers
  const hard = blockers.filter(
    (b) =>
      b.kind === "missing_abn" ||
      b.kind === "missing_legal_name" ||
      b.kind === "missing_po"
  )
  const nudges: PreRunNudge[] = [...(args.nudges ?? [])]
  // PC6: attach last-month reference hit-rate when provided
  if (args.referenceHitRate != null) {
    nudges.push({
      kind: "reference_hit_rate",
      detail: `Reference hit-rate last month: ${(args.referenceHitRate * 100).toFixed(1)}%`,
      value: args.referenceHitRate,
    })
  }
  return {
    periodMonth: args.periodMonth,
    blockers,
    nudges,
    hardBlockerCount: hard.length,
  }
}

export function clientMissingBlockers(client: {
  id: number
  name: string
  abn?: string | null
  legalBusinessName?: string | null
  poRequired?: boolean
  poNumber?: string | null
}): PreRunBlocker[] {
  const out: PreRunBlocker[] = []
  if (!String(client.abn ?? "").trim()) {
    out.push({
      kind: "missing_abn",
      clientId: client.id,
      clientName: client.name,
      detail: `${client.name}: missing ABN`,
    })
  }
  if (!String(client.legalBusinessName ?? "").trim()) {
    out.push({
      kind: "missing_legal_name",
      clientId: client.id,
      clientName: client.name,
      detail: `${client.name}: missing legal business name`,
    })
  }
  if (client.poRequired && !String(client.poNumber ?? "").trim()) {
    out.push({
      kind: "missing_po",
      clientId: client.id,
      clientName: client.name,
      detail: `${client.name}: PO required but missing`,
    })
  }
  return out
}
