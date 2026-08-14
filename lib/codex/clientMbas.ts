/**
 * MBA dropdown for Codex task detail: the selected client's campaign numbers,
 * highest / most recent first. Labels are "<mba_number> — <campaign name>".
 * MBA identity stays a string (no numeric coerce).
 */

export const MBA_NONE_VALUE = "__none__"

export type MbaPlanRow = {
  mba_number?: unknown
  mbaNumber?: unknown
  client_id?: unknown
  clients_id?: unknown
  clientId?: unknown
  campaign_name?: unknown
  campaignName?: unknown
  mp_campaignname?: unknown
}

export type MbaCampaignOption = {
  mba_number: string
  campaign_name: string
  label: string
}

export function sortMbaNumbersDesc(mbas: string[]): string[] {
  return mbas.toSorted((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }),
  )
}

function planClientId(row: MbaPlanRow): number | null {
  const raw = row.client_id ?? row.clients_id ?? row.clientId
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function planMbaNumber(row: MbaPlanRow): string {
  const raw = row.mba_number ?? row.mbaNumber
  if (typeof raw === "string") return raw.trim()
  if (raw == null) return ""
  return String(raw).trim()
}

function planCampaignName(row: MbaPlanRow): string {
  const raw = row.campaign_name ?? row.campaignName ?? row.mp_campaignname
  if (typeof raw === "string") return raw.trim()
  if (raw == null) return ""
  return String(raw).trim()
}

export function formatMbaOptionLabel(
  mbaNumber: string,
  campaignName: string | null | undefined,
): string {
  const mba = mbaNumber.trim()
  const name = (campaignName ?? "").trim()
  if (!name) return mba
  return `${mba} — ${name}`
}

function sortCampaignsDesc(rows: MbaCampaignOption[]): MbaCampaignOption[] {
  return rows.toSorted((a, b) =>
    b.mba_number.localeCompare(a.mba_number, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  )
}

/** Unique MBA campaigns for `clientId`, descending by MBA number. Empty when no client. */
export function campaignsForClientFromPlans(
  plans: MbaPlanRow[],
  clientId: number | null | undefined,
): MbaCampaignOption[] {
  if (clientId == null || !Number.isFinite(clientId) || clientId < 1) {
    return []
  }
  const seen = new Set<string>()
  const out: MbaCampaignOption[] = []
  for (const plan of plans) {
    if (planClientId(plan) !== clientId) continue
    const mba = planMbaNumber(plan)
    if (!mba || seen.has(mba)) continue
    seen.add(mba)
    const campaign_name = planCampaignName(plan)
    out.push({
      mba_number: mba,
      campaign_name,
      label: formatMbaOptionLabel(mba, campaign_name),
    })
  }
  return sortCampaignsDesc(out)
}

/** Unique MBA numbers for `clientId`, descending. Empty when no client. */
export function mbasForClientFromPlans(
  plans: MbaPlanRow[],
  clientId: number | null | undefined,
): string[] {
  return campaignsForClientFromPlans(plans, clientId).map((r) => r.mba_number)
}

/** Keep a legacy free-text MBA visible if it is not in the client's list. */
export function mbaSelectOptions(
  clientMbas: string[],
  currentMba: string | null | undefined,
): string[] {
  const cur = (currentMba ?? "").trim()
  if (!cur || clientMbas.includes(cur)) return clientMbas
  return sortMbaNumbersDesc([...clientMbas, cur])
}

export function mbaSelectCampaigns(
  clientCampaigns: MbaCampaignOption[],
  currentMba: string | null | undefined,
): MbaCampaignOption[] {
  const cur = (currentMba ?? "").trim()
  if (!cur || clientCampaigns.some((r) => r.mba_number === cur)) {
    return clientCampaigns
  }
  return sortCampaignsDesc([
    ...clientCampaigns,
    {
      mba_number: cur,
      campaign_name: "",
      label: formatMbaOptionLabel(cur, ""),
    },
  ])
}

export function matchMbaCampaignSearch(
  rows: MbaCampaignOption[],
  query: string,
): MbaCampaignOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => {
    return (
      r.mba_number.toLowerCase().includes(q) ||
      r.campaign_name.toLowerCase().includes(q) ||
      r.label.toLowerCase().includes(q)
    )
  })
}
