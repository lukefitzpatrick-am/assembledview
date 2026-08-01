/**
 * CP-8 — pure client-pays partition (complement of CP-3 payables media).
 *
 * Fee column is intentionally omitted: schedule_months fee rows are absent for
 * these lines (C-27). Billing-schedule fee belongs in a future slice.
 */

import {
  isFinanceExcludedCampaignStatus,
  isFinanceIncludedCampaignStatus,
} from "@/lib/finance/sections/financeCampaignStatus"
import { isServiceLineItemId } from "@/lib/finance/sections/serviceLineBucket"

export const CLIENT_PAYS_PAGE_CAPTION =
  "Media paid by the client directly to the publisher — excluded from Assembled payables. Agency fee on these lines is still billable."

/** Same C-29 / line-detail limitation the payables headline discloses. */
export const CLIENT_PAYS_LINE_DETAIL_NOTE =
  "Client-pays can only be detected on lines with real line detail; campaign-level __service__* rollup months can't carry the flag, so older campaigns without per-line data may have client-paid media that isn't shown here."

export const CLIENT_PAYS_FEE_OMIT_NOTE =
  "Fee column omitted this pass — schedule_months fee rows are $0 for client-pays lines (C-27). Billable agency fee lives on the invoicing / billing-schedule surface."

export type ClientPaysMediaCell = {
  lineItemId: string
  amountCents: number
  campaignStatus: string
  /** null = no line_items join (orphan / service). */
  clientPaysForMedia: boolean | null
}

/**
 * Partition delivery-media cells into payables headline vs client-pays detail.
 * Complements must be disjoint for included statuses with a real join.
 */
export function partitionClientPaysMedia(cells: ClientPaysMediaCell[]) {
  let payablesHeadlineCents = 0
  let clientPaysDetailCents = 0
  let clientPaysExcludedByStatusCents = 0
  let lineCount = 0
  const clientPaysLineIds = new Set<string>()

  for (const cell of cells) {
    if (isFinanceExcludedCampaignStatus(cell.campaignStatus)) {
      if (cell.clientPaysForMedia === true) {
        clientPaysExcludedByStatusCents += cell.amountCents
      }
      continue
    }
    if (!isFinanceIncludedCampaignStatus(cell.campaignStatus)) continue

    // Service synthetics cannot carry client_pays — never appear on this page.
    if (isServiceLineItemId(cell.lineItemId)) {
      if (cell.clientPaysForMedia !== true) {
        payablesHeadlineCents += cell.amountCents
      }
      continue
    }

    if (cell.clientPaysForMedia === true) {
      clientPaysDetailCents += cell.amountCents
      clientPaysLineIds.add(cell.lineItemId)
      continue
    }

    // Orphan (null) and agency-paid media stay in payables.
    payablesHeadlineCents += cell.amountCents
  }

  lineCount = clientPaysLineIds.size

  return {
    payablesHeadlineCents,
    clientPaysDetailCents,
    clientPaysExcludedByStatusCents,
    lineCount,
  }
}

export type FlatClientPaysRow = {
  clientId: number
  clientName: string
  mbaNumber: string
  campaignName: string
  campaignStatus: string
  lineItemId: string
  publisher: string
  channel: string | null
  month: string
  mediaCents: number
}

export type ClientPaysLineNode = {
  lineItemId: string
  publisher: string
  channel: string | null
  totalCents: number
  byMonth: Record<string, number>
}

export type ClientPaysMbaNode = {
  mbaNumber: string
  campaignName: string
  campaignStatus: string
  totalCents: number
  lines: ClientPaysLineNode[]
}

export type ClientPaysClientNode = {
  clientId: number
  clientName: string
  totalCents: number
  mbas: ClientPaysMbaNode[]
}

/** Nest flat month rows → client → MBA → line. */
export function nestClientPaysRows(rows: FlatClientPaysRow[]): ClientPaysClientNode[] {
  const clients = new Map<
    number,
    {
      clientId: number
      clientName: string
      totalCents: number
      mbas: Map<
        string,
        {
          mbaNumber: string
          campaignName: string
          campaignStatus: string
          totalCents: number
          lines: Map<string, ClientPaysLineNode>
        }
      >
    }
  >()

  for (const row of rows) {
    if (row.mediaCents === 0) continue
    let client = clients.get(row.clientId)
    if (!client) {
      client = {
        clientId: row.clientId,
        clientName: row.clientName,
        totalCents: 0,
        mbas: new Map(),
      }
      clients.set(row.clientId, client)
    }
    client.totalCents += row.mediaCents

    let mba = client.mbas.get(row.mbaNumber)
    if (!mba) {
      mba = {
        mbaNumber: row.mbaNumber,
        campaignName: row.campaignName,
        campaignStatus: row.campaignStatus,
        totalCents: 0,
        lines: new Map(),
      }
      client.mbas.set(row.mbaNumber, mba)
    }
    mba.totalCents += row.mediaCents
    if (row.campaignName && !mba.campaignName) mba.campaignName = row.campaignName
    if (row.campaignStatus) mba.campaignStatus = row.campaignStatus

    let line = mba.lines.get(row.lineItemId)
    if (!line) {
      line = {
        lineItemId: row.lineItemId,
        publisher: row.publisher,
        channel: row.channel,
        totalCents: 0,
        byMonth: {},
      }
      mba.lines.set(row.lineItemId, line)
    }
    line.totalCents += row.mediaCents
    line.byMonth[row.month] = (line.byMonth[row.month] ?? 0) + row.mediaCents
  }

  return [...clients.values()]
    .map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      totalCents: c.totalCents,
      mbas: [...c.mbas.values()]
        .map((m) => ({
          mbaNumber: m.mbaNumber,
          campaignName: m.campaignName,
          campaignStatus: m.campaignStatus,
          totalCents: m.totalCents,
          lines: [...m.lines.values()].sort(
            (a, b) => b.totalCents - a.totalCents || a.lineItemId.localeCompare(b.lineItemId)
          ),
        }))
        .sort((a, b) => b.totalCents - a.totalCents || a.mbaNumber.localeCompare(b.mbaNumber)),
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.clientName.localeCompare(b.clientName))
}
