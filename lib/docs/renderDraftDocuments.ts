/**
 * Publish dry-run: save body → financials → DRAFT MBA / Media Plan buffers.
 * Writes nothing — no Blob, no version row, no approved_slice.
 */
import "server-only"

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { createAdServingRateResolver } from "@/lib/billing/adServingRateResolver"
import { computeApprovedSlice } from "@/lib/finance/approvedSlice"
import { attachOverridesToLineInputs } from "@/lib/finance/billingOverrides"
import {
  buildFeeLoadingFromEditorFees,
  type EditorFeeState,
} from "@/lib/finance/buildEditorLineItemInputs"
import {
  computeCampaignFinancials,
  normaliseScheduleMediaType,
  resolveFeePctFromFeeLoading,
} from "@/lib/finance/computeCampaignFinancials"
import type { FeeLoading } from "@/lib/finance/campaignFinancials.types"
import { formatAUD } from "@/lib/format/money"
import { generateMBA } from "@/lib/generateMBA"
import {
  addKPISheet,
  generateMediaPlan,
  type KPISheetRow,
  type MediaItems,
  type MediaPlanHeader,
} from "@/lib/generateMediaPlan"
import { explodeExcelLineItems } from "@/lib/docs/explodeExcelLineItems"
import { filterMediaItemsForMbaScope } from "@/lib/docs/filterMediaItemsForMbaScope"
import { buildMbaDataFromFinancials } from "@/lib/docs/buildMbaDataFromFinancials"
import {
  applyMbaScopeLineApprovals,
  resolveMbaScopeInput,
  selectedMonthYearsForFinancials,
} from "@/lib/mediaplan/mbaScopeForSave"
import type { DraftDocumentsBody } from "@/lib/docs/draftDocumentsBody"
import {
  overrideRowsFromSaveLines,
  saveBodyToLineItemInputs,
} from "@/lib/docs/saveBodyLineInputs"
import {
  buildAdvertisingAssociatesMbaDataFromMediaItems,
  filterMediaItemsForAdvertisingAssociates,
  shouldIncludeMediaPlanLineItem,
} from "@/lib/mediaplan/advertisingAssociatesExcel"
import {
  buildMediaPlanWorkbookMbaData,
  MEDIA_PLAN_WORKBOOK_FLAG_TO_BILLING_KEY,
  MEDIA_PLAN_WORKBOOK_MEDIA_TYPES,
} from "@/lib/mediaplan/buildMediaPlanWorkbookMbaData"
import { excludedFromMbaScopeNoteFromLines } from "@/lib/mediaplan/excludedMbaScopeNote"
import type { Publisher } from "@/lib/types/publisher"
import { format, parseISO } from "date-fns"

const BILLING_KEY_TO_FLAG: Record<string, string> = Object.fromEntries(
  Object.entries(MEDIA_PLAN_WORKBOOK_FLAG_TO_BILLING_KEY).map(([flag, key]) => [
    key,
    flag,
  ])
)

function filenameToken(raw: string | null | undefined, fallback: string): string {
  const s = String(raw ?? "").trim() || fallback
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "").replace(/\s+/g, "_")
}

function formatDateDdMmYyyy(raw: unknown): string {
  if (raw == null || raw === "") return ""
  const s = String(raw).trim()
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return format(parseISO(s.slice(0, 10)), "dd/MM/yyyy")
    }
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy")
  } catch {
    /* fall through */
  }
  return s
}

function emptyMediaItems(): MediaItems {
  return {
    search: [],
    socialMedia: [],
    digiAudio: [],
    digiDisplay: [],
    digiVideo: [],
    bvod: [],
    progDisplay: [],
    progVideo: [],
    progBvod: [],
    progOoh: [],
    progAudio: [],
    newspaper: [],
    magazines: [],
    television: [],
    radio: [],
    ooh: [],
    cinema: [],
    integration: [],
    influencers: [],
    production: [],
  }
}

function readAssembledLogoBase64(): string {
  try {
    return readFileSync(join(process.cwd(), "public/assembled-logo.png")).toString(
      "base64"
    )
  } catch {
    return ""
  }
}

function asKpiRows(raw: unknown): KPISheetRow[] {
  if (!Array.isArray(raw)) return []
  const rows: KPISheetRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    rows.push({
      mediaType: String(r.mediaType ?? ""),
      publisher: String(r.publisher ?? ""),
      label: String(r.label ?? ""),
      buyType: String(r.buyType ?? ""),
      spend: Number(r.spend) || 0,
      deliverables: Number(r.deliverables) || 0,
      ctr: typeof r.ctr === "number" ? r.ctr : null,
      vtr: typeof r.vtr === "number" ? r.vtr : null,
      cpv: typeof r.cpv === "number" ? r.cpv : null,
      conversion_rate:
        typeof r.conversion_rate === "number" ? r.conversion_rate : null,
      frequency: typeof r.frequency === "number" ? r.frequency : null,
      calculatedClicks:
        typeof r.calculatedClicks === "number" ? r.calculatedClicks : null,
      calculatedViews:
        typeof r.calculatedViews === "number" ? r.calculatedViews : null,
      calculatedReach:
        typeof r.calculatedReach === "number" ? r.calculatedReach : null,
    })
  }
  return rows
}

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }
  if (body && typeof body === "object" && "arrayBuffer" in body) {
    return Buffer.from(await (body as Blob).arrayBuffer())
  }
  throw new Error(`Cannot convert ${typeof body} to Buffer`)
}

export type RenderedDraftDocument = {
  filename: string
  mime: string
  buffer: Buffer
}

export async function renderDraftDocuments(
  body: DraftDocumentsBody,
  now: Date = new Date()
): Promise<RenderedDraftDocument> {
  const lines = body.lineItems
  const fromSnapshot = body.feeSnapshot
    ? buildFeeLoadingFromEditorFees(body.feeSnapshot as EditorFeeState)
    : {}
  const feeLoading: FeeLoading = {
    ...fromSnapshot,
    ...(body.feeLoading as FeeLoading),
  }
  const approvedFromChips = body.partialMba?.approvedLineItemIds
  const resolvedMbaScope = resolveMbaScopeInput({
    mbaScope: body.mbaScope,
    selectedMonthYears: body.selectedMonthYears,
  })
  const selectedMonthYears =
    resolvedMbaScope.source === "mbaScope" ||
    resolvedMbaScope.source === "legacyMonths"
      ? selectedMonthYearsForFinancials(resolvedMbaScope)
      : (body.partialMba?.selectedMonthYears ?? body.selectedMonthYears)

  let lineInputs = saveBodyToLineItemInputs(lines)
  if (resolvedMbaScope.source === "mbaScope") {
    lineInputs = applyMbaScopeLineApprovals(
      lineInputs,
      resolvedMbaScope.scope.lineItemIds,
    )
  } else if (approvedFromChips) {
    const allowed = new Set(approvedFromChips.map((id) => String(id).trim()))
    lineInputs = lineInputs.map((l) => ({
      ...l,
      approval: allowed.has(l.lineItemId) ? "approved" : "excluded",
    }))
  }
  const lineItemsWithOverrides = attachOverridesToLineInputs(
    lineInputs,
    overrideRowsFromSaveLines(lines)
  )
  const getRateForMediaType = createAdServingRateResolver({
    video: body.adservvideo ?? 0,
    audio: body.adservaudio ?? 0,
    display: body.adservdisplay ?? 0,
    imp: body.adservimp ?? 0,
  })
  const financials = computeCampaignFinancials(
    lineItemsWithOverrides,
    { feeLoading },
    {
      getRateForMediaType,
      adservaudio: body.adservaudio,
      selectedMonthYears,
    }
  )
  const approvedLineItemIds = lineInputs
    .filter((l) => l.approval !== "excluded")
    .map((l) => String(l.lineItemId).trim())
    .filter(Boolean)
  const slice = computeApprovedSlice({
    financials,
    selectedMonthYears,
    approvedLineItemIds,
  })

  const clientName =
    body.clientAddress?.name ||
    body.ensureMaster?.mpClientName ||
    "client"
  const campaignName = body.campaignName || "campaign"

  if (body.kind === "mba_pdf") {
    const mbaData = buildMbaDataFromFinancials({
      mbaNumber: body.mbaNumber,
      campaignName: body.campaignName,
      brand: body.brand,
      poNumber: body.poNumber,
      versionNumber: body.versionNumber,
      campaignStartDate: body.campaignStartDate,
      campaignEndDate: body.campaignEndDate,
      clientName,
      clientAddress: body.clientAddress,
      financials,
      slice,
      now,
    })
    const pdf = await generateMBA(mbaData)
    const filename = `DRAFT-MBA_${filenameToken(clientName, "client")}_${filenameToken(campaignName, "campaign")}_not-for-client.pdf`
    return {
      filename,
      mime: "application/pdf",
      buffer: await toBuffer(pdf),
    }
  }

  const mediaItems = emptyMediaItems()
  const channelFlags: Record<string, unknown> = { ...(body.channelFlags ?? {}) }
  for (const line of lines) {
    const mediaKey = normaliseScheduleMediaType(line.mediaType)
    if (!mediaKey || !(mediaKey in mediaItems)) continue
    const flag = BILLING_KEY_TO_FLAG[mediaKey]
    if (flag) channelFlags[flag] = true
    const formLine: Record<string, unknown> = {
      ...(line.attrs ?? {}),
      lineItemId: line.lineItemId,
      line_item_id: line.lineItemId,
      buyType: line.buyType,
      bursts: line.bursts,
      budgetIncludesFees: line.budgetIncludesFees,
      clientPaysForMedia: line.clientPaysForMedia,
      noAdserving: line.noAdserving,
      market: line.market,
      publisher: line.publisher,
      platform: line.platform,
      bidStrategy: line.bidStrategy,
      buyingDemo: line.buyingDemo,
    }
    const feePct =
      typeof line.feePct === "number" && Number.isFinite(line.feePct)
        ? line.feePct
        : resolveFeePctFromFeeLoading(mediaKey, feeLoading)
    const excelRows = explodeExcelLineItems(
      mediaKey,
      formLine,
      feePct,
      0
    ).filter(shouldIncludeMediaPlanLineItem)
    mediaItems[mediaKey] = [...mediaItems[mediaKey], ...excelRows]
  }

  const mediaItemsScoped = filterMediaItemsForMbaScope(
    mediaItems,
    resolvedMbaScope.source === "mbaScope"
      ? resolvedMbaScope.scope
      : approvedFromChips
        ? { lineItemIds: approvedFromChips }
        : null,
  )

  const mediaByKey: Record<string, number> = {}
  for (const line of financials.perLine) {
    if (line.flags.excluded) continue
    mediaByKey[line.mediaType] = (mediaByKey[line.mediaType] ?? 0) + line.media
  }
  const workbookMba = buildMediaPlanWorkbookMbaData({
    mediaTypes: MEDIA_PLAN_WORKBOOK_MEDIA_TYPES,
    formFlags: channelFlags,
    campaignFinancialsMediaByKey: mediaByKey,
    mbaScopeTotals: financials.mbaScopeTotals,
    excludedFromMbaScopeNote: excludedFromMbaScopeNoteFromLines(
      financials.perLine
    ),
  })
  const budgetCents = body.campaignBudgetCents
  const header: MediaPlanHeader = {
    logoBase64: readAssembledLogoBase64(),
    logoWidth: 457,
    logoHeight: 71,
    client: clientName,
    brand: String(body.brand ?? ""),
    campaignName: String(body.campaignName ?? ""),
    mbaNumber: body.mbaNumber,
    clientContact: String(body.clientContact ?? ""),
    planVersion: String(body.versionNumber),
    poNumber: String(body.poNumber ?? ""),
    campaignBudget: formatAUD(
      typeof budgetCents === "number" ? budgetCents / 100 : null
    ),
    campaignStatus: String(
      body.campaignStatus ?? body.ensureMaster?.campaignStatus ?? ""
    ),
    campaignStart: formatDateDdMmYyyy(body.campaignStartDate),
    campaignEnd: formatDateDdMmYyyy(body.campaignEndDate),
  }

  const publishers = (body.publishers ?? []) as Publisher[]
  const itemsForWorkbook =
    body.kind === "aa_media_plan"
      ? filterMediaItemsForAdvertisingAssociates(mediaItemsScoped, publishers)
      : mediaItemsScoped
  const mbaForWorkbook =
    body.kind === "aa_media_plan"
      ? buildAdvertisingAssociatesMbaDataFromMediaItems(itemsForWorkbook)
      : workbookMba
  const workbook = await generateMediaPlan(
    header,
    itemsForWorkbook,
    mbaForWorkbook,
    {
      draft: true,
      ...(body.kind === "aa_media_plan" ? { mbaTotalsLayout: "aa" as const } : {}),
    }
  )
  const kpiRows = asKpiRows(body.kpiRows)
  if (kpiRows.length > 0) {
    addKPISheet(workbook, kpiRows, { draft: true })
  }
  const buffer = Buffer.from(
    (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  )
  const prefix = body.kind === "aa_media_plan" ? "DRAFT-AA-MediaPlan" : "DRAFT-MediaPlan"
  const filename = `${prefix}_${filenameToken(campaignName, "campaign")}_not-for-client.xlsx`
  return {
    filename,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  }
}
