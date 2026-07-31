/**
 * T4b — best-effort Xano mirror after Postgres `savePlanVersion` commits.
 *
 * Postgres is authoritative. Mirror failures never throw to the caller, never
 * roll back Postgres, and surface `{ mirror: "failed" }` for a non-blocking banner.
 * Retry from admin: POST /api/admin/xano-mirror/retry.
 */
import { and, eq } from "drizzle-orm"

import { getDb, schema, type Db } from "@/db"
import type { LineChannel } from "@/db/schema"
import {
  withInsertBeforeDelete,
} from "@/lib/api/replaceChannelLineItems"
import { CHANNEL_ENDPOINT_TO_CHANNEL, mapLineItemFromPostgres } from "@/lib/data/planShapes"
import { recordShadowDiff } from "@/lib/data/shadowDiff"
import type { CampaignKpiInput } from "@/lib/kpi/types"
import type {
  SavePlanLineItem,
  SavePlanMode,
  SavePlanVersionInput,
} from "@/lib/data/savePlan"

export type MirrorStatus = "ok" | "failed"

export type MirrorPlanToXanoResult = {
  mirror: MirrorStatus
  /** Wall time of the mirror attempt after Postgres commit (ms). */
  durationMs: number
  xanoVersionId?: number
  error?: string
}

export type MirrorPlanToXanoInput = {
  mbaNumber: string
  versionNumber: number
  /** Postgres version id (also used as Xano FK when ids are ETL-aligned). */
  versionId: number
  clientName: string
  masterId: number
  /**
   * O4.6 — publish mirrors bump the Xano master watermark; draft / new_version
   * leave the master untouched (staged rows stay hidden by vn > watermark).
   */
  mode?: SavePlanMode
  campaignName?: string | null
  campaignStatus?: string | null
  campaignStartDate?: string | null
  campaignEndDate?: string | null
  brand?: string | null
  clientContact?: string | null
  poNumber?: string | null
  campaignBudgetCents?: number | null
  fixedFee?: boolean | null
  channelFlags?: Record<string, unknown> | null
  legacySchedules?: unknown
  lineItems: SavePlanLineItem[]
  /** Optional KPI fan-out; empty/omit skips sync (syncCampaignKpis no-ops on []). */
  kpiRows?: CampaignKpiInput[]
}

export type MirrorChannelSaver = (
  mediaPlanVersionId: number,
  mbaNumber: string,
  clientName: string,
  planNumber: string,
  lineItems: any[]
) => Promise<any[]>

export type MirrorMasterPatcher = (input: MirrorPlanToXanoInput) => Promise<void>

export type MirrorDeps = {
  saveByChannel: Partial<Record<LineChannel, MirrorChannelSaver>>
  upsertVersion: (input: MirrorPlanToXanoInput) => Promise<number>
  syncCampaignKpis: (rows: CampaignKpiInput[]) => Promise<unknown>
  /** Publish-only: PATCH Xano media_plan_master watermark. */
  patchMaster?: MirrorMasterPatcher
  now?: () => number
}

const CHANNEL_TO_ENDPOINT: Record<LineChannel, string> = Object.fromEntries(
  Object.entries(CHANNEL_ENDPOINT_TO_CHANNEL).map(([endpoint, channel]) => [
    channel,
    endpoint,
  ])
) as Record<LineChannel, string>

/** Invert endpoint map — every LINE_CHANNELS value must appear. */
export function channelToEndpoint(channel: LineChannel): string {
  const endpoint = CHANNEL_TO_ENDPOINT[channel]
  if (!endpoint) throw new Error(`No Xano endpoint for channel=${channel}`)
  return endpoint
}

/**
 * Convert a SavePlanLineItem into the UI-ish shape save*LineItems expect
 * (commons + attrs + bursts + stable line_item_id).
 */
export function savePlanLineItemToSaverInput(line: SavePlanLineItem): Record<string, unknown> {
  const attrs =
    line.attrs && typeof line.attrs === "object" && !Array.isArray(line.attrs)
      ? (line.attrs as Record<string, unknown>)
      : {}
  return {
    ...attrs,
    line_item_id: line.lineItemId,
    market: line.market ?? attrs.market ?? "",
    buying_demo: line.buyingDemo ?? attrs.buying_demo ?? "",
    buyingDemo: line.buyingDemo ?? attrs.buyingDemo ?? "",
    buy_type: line.buyType ?? attrs.buy_type ?? "",
    buyType: line.buyType ?? attrs.buyType ?? "",
    publisher: line.publisher ?? attrs.publisher ?? "",
    platform: line.platform ?? attrs.platform ?? "",
    bid_strategy: line.bidStrategy ?? attrs.bid_strategy ?? "",
    bidStrategy: line.bidStrategy ?? attrs.bidStrategy ?? "",
    fixed_cost_media: line.fixedCostMedia ?? attrs.fixed_cost_media ?? false,
    fixedCostMedia: line.fixedCostMedia ?? attrs.fixedCostMedia ?? false,
    client_pays_for_media: line.clientPaysForMedia ?? attrs.client_pays_for_media ?? false,
    clientPaysForMedia: line.clientPaysForMedia ?? attrs.clientPaysForMedia ?? false,
    budget_includes_fees: line.budgetIncludesFees ?? attrs.budget_includes_fees ?? false,
    budgetIncludesFees: line.budgetIncludesFees ?? attrs.budgetIncludesFees ?? false,
    no_adserving: line.noAdserving ?? attrs.no_adserving ?? false,
    noAdserving: line.noAdserving ?? attrs.noAdserving ?? false,
    bursts: line.bursts,
    bursts_json: line.bursts,
    feePct: line.feePct,
    feePercentage: line.feePct,
    fee_percentage: line.feePct,
    media_type: line.mediaType,
    mediaType: line.mediaType,
    label: line.label,
  }
}

function groupLineItemsByChannel(
  lines: SavePlanLineItem[]
): Map<LineChannel, SavePlanLineItem[]> {
  const map = new Map<LineChannel, SavePlanLineItem[]>()
  for (const line of lines) {
    const list = map.get(line.channel) ?? []
    list.push(line)
    map.set(line.channel, list)
  }
  return map
}

function logMirrorFailure(
  mbaNumber: string,
  versionNumber: number,
  err: unknown
): string {
  const message = err instanceof Error ? err.message : String(err ?? "unknown")
  console.error(
    `[xano-mirror] failed — Postgres is authoritative, retry from admin`,
    { mba: mbaNumber, version: versionNumber, error: message }
  )
  recordShadowDiff({
    at: Date.now(),
    domain: "plans-mirror",
    table: "xano_mirror",
    xanoCount: 0,
    postgresCount: 1,
    missingInPostgres: [],
    missingInXano: [`${mbaNumber}@v${versionNumber}`],
    fieldDiffs: [
      {
        id: `${mbaNumber}@v${versionNumber}`,
        fields: [{ field: "mirror_error", xano: message, postgres: "ok" }],
      },
    ],
  })
  return message
}

async function defaultUpsertVersion(input: MirrorPlanToXanoInput): Promise<number> {
  const { createMediaPlanVersion } = await import("@/lib/api")
  const { getXanoBaseUrl, xanoAuthHeaderRecord, xanoPostHeaderRecord } = await import(
    "@/lib/api/xano"
  )
  const { fetchAllXanoPages } = await import("@/lib/api/xanoPagination")

  const budget =
    typeof input.campaignBudgetCents === "number"
      ? input.campaignBudgetCents / 100
      : 0

  const flags = (input.channelFlags ?? {}) as Record<string, unknown>
  const flag = (key: string) => Boolean(flags[key])

  const payload: Record<string, unknown> = {
    media_plan_master_id: input.masterId,
    version_number: input.versionNumber,
    mba_number: input.mbaNumber,
    campaign_name: input.campaignName ?? "",
    campaign_status: input.campaignStatus ?? "Draft",
    campaign_start_date: input.campaignStartDate ?? "",
    campaign_end_date: input.campaignEndDate ?? "",
    brand: input.brand ?? "",
    mp_client_name: input.clientName,
    client_contact: input.clientContact ?? "",
    po_number: input.poNumber ?? "",
    mp_campaignbudget: budget,
    fixed_fee: Boolean(input.fixedFee),
    mp_television: flag("television") || flag("mp_television"),
    mp_radio: flag("radio") || flag("mp_radio"),
    mp_newspaper: flag("newspaper") || flag("mp_newspaper"),
    mp_magazines: flag("magazines") || flag("mp_magazines"),
    mp_ooh: flag("ooh") || flag("mp_ooh"),
    mp_cinema: flag("cinema") || flag("mp_cinema"),
    mp_digidisplay: flag("digi_display") || flag("mp_digidisplay"),
    mp_digiaudio: flag("digi_audio") || flag("mp_digiaudio"),
    mp_digivideo: flag("digi_video") || flag("mp_digivideo"),
    mp_bvod: flag("digi_bvod") || flag("mp_bvod"),
    mp_integration: flag("integrations") || flag("mp_integration"),
    mp_search: flag("search") || flag("mp_search"),
    mp_socialmedia: flag("social") || flag("mp_socialmedia"),
    mp_progdisplay: flag("prog_display") || flag("mp_progdisplay"),
    mp_progvideo: flag("prog_video") || flag("mp_progvideo"),
    mp_progbvod: flag("prog_bvod") || flag("mp_progbvod"),
    mp_progaudio: flag("prog_audio") || flag("mp_progaudio"),
    mp_progooh: flag("prog_ooh") || flag("mp_progooh"),
    mp_influencers: flag("influencers") || flag("mp_influencers"),
    mp_production: flag("production") || flag("mp_production"),
  }

  const schedules = input.legacySchedules as
    | { billingSchedule?: unknown; deliverySchedule?: unknown }
    | null
    | undefined
  if (schedules?.billingSchedule != null) {
    payload.billingSchedule = schedules.billingSchedule
  }
  if (schedules?.deliverySchedule != null) {
    payload.delivery_schedule = schedules.deliverySchedule
    payload.deliverySchedule = schedules.deliverySchedule
  }

  const baseUrl = getXanoBaseUrl([
    "XANO_MEDIA_PLANS_BASE_URL",
    "XANO_MEDIAPLANS_BASE_URL",
  ])

  // Always hit Xano for version lookup — DATA_BACKEND_PLANS may already be postgres.
  let existingId: number | null = null
  try {
    const list = await fetchAllXanoPages(
      `${baseUrl}/media_plan_versions`,
      { mba_number: input.mbaNumber },
      "xano_mirror_versions"
    )
    const match = (Array.isArray(list) ? list : []).find((v: any) => {
      const mba = String(v?.mba_number ?? "").trim().toLowerCase()
      const vn = Number(v?.version_number)
      return (
        mba === input.mbaNumber.trim().toLowerCase() &&
        vn === input.versionNumber
      )
    })
    if (match?.id != null && Number.isFinite(Number(match.id))) {
      existingId = Number(match.id)
    }
  } catch {
    // lookup failure → try patch by PG id / create
  }

  if (existingId != null) {
    const res = await fetch(`${baseUrl}/media_plan_versions/${existingId}`, {
      method: "PATCH",
      headers: xanoPostHeaderRecord(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Xano version PATCH failed: ${res.status} ${text}`)
    }
    return existingId
  }

  const targetId = input.versionId
  const patchRes = await fetch(`${baseUrl}/media_plan_versions/${targetId}`, {
    method: "PATCH",
    headers: {
      ...xanoPostHeaderRecord(),
      ...xanoAuthHeaderRecord(),
    },
    body: JSON.stringify(payload),
  })
  if (patchRes.ok) return targetId

  const created = await createMediaPlanVersion(payload as any)
  const id = Number((created as any)?.id)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Xano createMediaPlanVersion returned no id")
  }
  return id
}

/**
 * O4.6 — restore legacy publish semantic: bump Xano master.version_number
 * watermark (+ campaign_status) so the staged version becomes visible.
 * Shape matches MBA PATCH publish: only those fields, never id/mba_number.
 */
async function defaultPatchMaster(input: MirrorPlanToXanoInput): Promise<void> {
  const { getXanoBaseUrl, xanoPostHeaderRecord, xanoAuthHeaderRecord } = await import(
    "@/lib/api/xano"
  )
  const baseUrl = getXanoBaseUrl([
    "XANO_MEDIA_PLANS_BASE_URL",
    "XANO_MEDIAPLANS_BASE_URL",
  ])
  const masterId = Number(input.masterId)
  if (!Number.isFinite(masterId) || masterId <= 0) {
    throw new Error(`Xano master PATCH refused — invalid masterId=${input.masterId}`)
  }
  const body: Record<string, unknown> = {
    version_number: input.versionNumber,
  }
  if (input.campaignStatus != null && String(input.campaignStatus).trim() !== "") {
    body.campaign_status = input.campaignStatus
  }
  const res = await fetch(`${baseUrl}/media_plan_master/${masterId}`, {
    method: "PATCH",
    headers: {
      ...xanoPostHeaderRecord(),
      ...xanoAuthHeaderRecord(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Xano master PATCH failed: ${res.status} ${text}`)
  }
}

async function loadDefaultSaveByChannel(): Promise<
  Partial<Record<LineChannel, MirrorChannelSaver>>
> {
  const api = await import("@/lib/api")
  return {
    television: api.saveTelevisionLineItems,
    newspaper: api.saveNewspaperLineItems,
    social: api.saveSocialMediaLineItems,
    production: api.saveProductionLineItems,
    radio: api.saveRadioLineItems,
    magazines: api.saveMagazinesLineItems,
    ooh: api.saveOOHLineItems,
    cinema: api.saveCinemaLineItems,
    digi_display: api.saveDigitalDisplayLineItems,
    digi_audio: api.saveDigitalAudioLineItems,
    digi_video: api.saveDigitalVideoLineItems,
    digi_bvod: api.saveBVODLineItems,
    integrations: api.saveIntegrationLineItems,
    search: api.saveSearchLineItems,
    prog_display: api.saveProgDisplayLineItems,
    prog_video: api.saveProgVideoLineItems,
    prog_bvod: api.saveProgBVODLineItems,
    prog_audio: api.saveProgAudioLineItems,
    prog_ooh: api.saveProgOOHLineItems,
    influencers: api.saveInfluencersLineItems,
  }
}

/**
 * Best-effort mirror. NEVER throws — returns `{ mirror: "failed" }` on any error.
 */
export async function mirrorPlanToXano(
  input: MirrorPlanToXanoInput,
  deps?: Partial<MirrorDeps>
): Promise<MirrorPlanToXanoResult> {
  const now = deps?.now ?? Date.now
  const started = now()

  try {
    const saveByChannel =
      deps?.saveByChannel ?? (await loadDefaultSaveByChannel())
    const upsertVersion = deps?.upsertVersion ?? defaultUpsertVersion
    const syncCampaignKpis =
      deps?.syncCampaignKpis ??
      (async (rows: CampaignKpiInput[]) => {
        const { syncCampaignKpis: sync } = await import("@/lib/kpi/campaignKpi")
        return sync(rows)
      })

    const xanoVersionId = await upsertVersion(input)
    const planNumber = String(input.versionNumber)
    const byChannel = groupLineItemsByChannel(input.lineItems)

    // Touch every channel that has a saver — empty arrays clear Xano for that
    // channel (replace semantics). Always include production.
    const channels = new Set<LineChannel>([
      ...(Object.keys(saveByChannel) as LineChannel[]),
      "production",
    ])

    await withInsertBeforeDelete(async () => {
      const jobs: Promise<unknown>[] = []
      for (const channel of channels) {
        const saver = saveByChannel[channel]
        if (!saver) continue
        const lines = byChannel.get(channel) ?? []
        const payload = lines.map(savePlanLineItemToSaverInput)
        jobs.push(
          saver(
            xanoVersionId,
            input.mbaNumber,
            input.clientName,
            planNumber,
            payload
          )
        )
      }
      await Promise.all(jobs)
    })

    await syncCampaignKpis(input.kpiRows ?? [])

    // O4.6 — publish completes by bumping the Xano master watermark. Draft /
    // new_version mirrors stage version rows only (legacy deferMasterVersionPublish).
    if (input.mode === "publish") {
      const patchMaster = deps?.patchMaster ?? defaultPatchMaster
      await patchMaster(input)
    }

    return {
      mirror: "ok",
      durationMs: now() - started,
      xanoVersionId,
    }
  } catch (err) {
    const error = logMirrorFailure(input.mbaNumber, input.versionNumber, err)
    return {
      mirror: "failed",
      durationMs: now() - started,
      error,
    }
  }
}

/** Build mirror input from a completed savePlanVersion call + original request. */
export function mirrorInputFromSave(
  saveInput: SavePlanVersionInput,
  versionId: number,
  clientName: string,
  kpiRows?: CampaignKpiInput[],
  /** Server-resolved version number from savePlanVersion (O4.6). */
  resolvedVersionNumber?: number
): MirrorPlanToXanoInput {
  return {
    mbaNumber: saveInput.mbaNumber,
    versionNumber: resolvedVersionNumber ?? saveInput.versionNumber,
    versionId,
    clientName,
    masterId: saveInput.masterId,
    mode: saveInput.mode,
    campaignName: saveInput.campaignName,
    campaignStatus: saveInput.campaignStatus,
    campaignStartDate: saveInput.campaignStartDate,
    campaignEndDate: saveInput.campaignEndDate,
    brand: saveInput.brand,
    clientContact: saveInput.clientContact,
    poNumber: saveInput.poNumber,
    campaignBudgetCents: saveInput.campaignBudgetCents,
    fixedFee: saveInput.fixedFee,
    channelFlags: saveInput.channelFlags,
    lineItems: saveInput.lineItems,
    kpiRows,
  }
}

/**
 * Admin retry: load version + line_items from Postgres and re-mirror to Xano.
 */
export async function retryMirrorFromPostgres(
  mbaNumber: string,
  versionNumber: number,
  db: Db = getDb(),
  deps?: Partial<MirrorDeps>
): Promise<MirrorPlanToXanoResult> {
  const mba = mbaNumber.trim()
  const [version] = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(
      and(
        eq(schema.mediaPlanVersions.mbaNumber, mba),
        eq(schema.mediaPlanVersions.versionNumber, versionNumber)
      )
    )
    .limit(1)

  if (!version) {
    return {
      mirror: "failed",
      durationMs: 0,
      error: `No Postgres version for mba=${mba} version=${versionNumber}`,
    }
  }

  const [master] = await db
    .select({
      id: schema.mediaPlanMasters.id,
      mpClientName: schema.mediaPlanMasters.mpClientName,
      publishedVersionId: schema.mediaPlanMasters.publishedVersionId,
    })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, version.masterId))
    .limit(1)

  const lines = await db
    .select()
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, version.id))

  const clientName =
    String(master?.mpClientName ?? "").trim() || mba

  const saveLines: SavePlanLineItem[] = lines.map((row) => {
    const assembled = mapLineItemFromPostgres(
      {
        id: row.id,
        channel: row.channel,
        line_item_id: row.lineItemId,
        position: row.position,
        market: row.market,
        buying_demo: row.buyingDemo,
        buy_type: row.buyType,
        publisher: row.publisher,
        platform: row.platform,
        bid_strategy: row.bidStrategy,
        fixed_cost_media: row.fixedCostMedia,
        client_pays_for_media: row.clientPaysForMedia,
        budget_includes_fees: row.budgetIncludesFees,
        no_adserving: row.noAdserving,
        bursts: row.bursts,
        attrs: row.attrs,
        created_at: row.createdAt,
      },
      {
        versionId: version.id,
        versionNumber: version.versionNumber,
        mbaNumber: version.mbaNumber,
        mpClientName: clientName,
      }
    )
    const attrs = (row.attrs ?? {}) as Record<string, unknown>
    return {
      lineItemId: row.lineItemId,
      channel: row.channel,
      position: row.position,
      market: row.market,
      buyingDemo: row.buyingDemo,
      buyType: row.buyType,
      publisher: row.publisher,
      platform: row.platform,
      bidStrategy: row.bidStrategy,
      fixedCostMedia: row.fixedCostMedia,
      clientPaysForMedia: row.clientPaysForMedia,
      budgetIncludesFees: row.budgetIncludesFees,
      noAdserving: row.noAdserving,
      bursts: row.bursts ?? [],
      attrs,
      mediaType: String(attrs.media_type ?? attrs.mediaType ?? row.channel),
      rate: Number(attrs.rate ?? 0) || 0,
      enteredAmount: Number(attrs.enteredAmount ?? attrs.entered_amount ?? 0) || 0,
      feePct:
        typeof attrs.feePct === "number"
          ? attrs.feePct
          : typeof attrs.fee_percentage === "number"
            ? attrs.fee_percentage
            : undefined,
      label: assembled.label != null ? String(assembled.label) : undefined,
    }
  })

  // Admin retry of the published tip must re-bump the Xano watermark.
  const mode: SavePlanMode =
    master?.publishedVersionId != null && master.publishedVersionId === version.id
      ? "publish"
      : "draft"

  return mirrorPlanToXano(
    {
      mbaNumber: version.mbaNumber,
      versionNumber: version.versionNumber,
      versionId: version.id,
      clientName,
      masterId: version.masterId,
      mode,
      campaignName: version.campaignName,
      campaignStatus: version.campaignStatus,
      campaignStartDate: version.campaignStartDate,
      campaignEndDate: version.campaignEndDate,
      brand: version.brand,
      clientContact: version.clientContact,
      poNumber: version.poNumber,
      campaignBudgetCents: version.campaignBudgetCents,
      fixedFee: version.fixedFee,
      channelFlags:
        version.channelFlags && typeof version.channelFlags === "object"
          ? (version.channelFlags as Record<string, unknown>)
          : null,
      legacySchedules: version.legacySchedules,
      lineItems: saveLines,
    },
    deps
  )
}
