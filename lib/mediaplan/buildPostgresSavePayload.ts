import type { LineChannel } from "@/db/schema"
import type { SavePlanLineItem, SavePlanMode } from "@/lib/data/savePlan"
import type {
  FeeLoading,
  LineItemApproval,
  LineItemInput,
} from "@/lib/finance/campaignFinancials.types"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { mapUiMediaTypeToLineChannel } from "@/lib/mediaplan/mapUiMediaTypeToLineChannel"
import { parseMoneyInput } from "@/lib/format/money"

const ATTR_SKIP = new Set([
  "id",
  "created_at",
  "mba_number",
  "mp_client_name",
  "mp_plannumber",
  "media_plan_version",
  "line_item_id",
  "lineItemId",
  "bursts",
  "bursts_json",
  "market",
  "buying_demo",
  "buyingDemo",
  "buy_type",
  "buyType",
  "publisher",
  "platform",
  "bid_strategy",
  "bidStrategy",
  "fixed_cost_media",
  "fixedCostMedia",
  "client_pays_for_media",
  "clientPaysForMedia",
  "budget_includes_fees",
  "budgetIncludesFees",
  "no_adserving",
  "noAdserving",
  "_reactKey",
])

function pickAttrs(raw: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (ATTR_SKIP.has(k)) continue
    out[k] = v
  }
  return Object.keys(out).length > 0 ? out : null
}

function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  return parseMoneyInput(value as string | number | null | undefined) ?? 0
}

function stripBillingPrefix(id: string): string {
  const s = String(id ?? "").trim()
  if (!s.startsWith("billing-")) return s
  const idx = s.indexOf("::")
  return idx >= 0 ? s.slice(idx + 2) : s
}

function approvalByRealId(
  billingLines: LineItemInput[]
): Map<string, { approval: LineItemApproval; billingOverride?: LineItemInput["billingOverride"]; feeOverride?: LineItemInput["feeOverride"]; feePct?: number; label?: string }> {
  const map = new Map<
    string,
    {
      approval: LineItemApproval
      billingOverride?: LineItemInput["billingOverride"]
      feeOverride?: LineItemInput["feeOverride"]
      feePct?: number
      label?: string
    }
  >()
  for (const line of billingLines) {
    const real = stripBillingPrefix(line.lineItemId)
    if (!real || real.startsWith("new-")) continue
    map.set(real, {
      approval: line.approval,
      billingOverride: line.billingOverride,
      feeOverride: line.feeOverride,
      feePct: line.feePct,
      label: line.label,
    })
  }
  return map
}

/**
 * Build T4a line payload from post-reassign channel snapshots (real line_item_ids)
 * plus optional billingSaveInputs for approval / overrides.
 */
export function buildSavePlanLineItemsFromSnapshots(
  snapshotsByMediaType: Record<string, unknown[] | undefined>,
  billingLines: LineItemInput[] = []
): SavePlanLineItem[] {
  const approvals = approvalByRealId(billingLines)
  const out: SavePlanLineItem[] = []
  const seen = new Set<string>()

  for (const [mediaType, rows] of Object.entries(snapshotsByMediaType)) {
    if (!rows?.length) continue
    const channel = mapUiMediaTypeToLineChannel(mediaType)
    if (!channel) {
      throw new Error(`Cannot map mediaType "${mediaType}" to line_channel`)
    }

    rows.forEach((rawRow, index) => {
      const raw = (rawRow ?? {}) as Record<string, unknown>
      const lineItemId = String(raw.line_item_id ?? raw.lineItemId ?? "").trim()
      if (!lineItemId) {
        throw new Error(
          `Missing line_item_id for ${mediaType}[${index}] — reassign before Postgres save`
        )
      }
      if (seen.has(lineItemId)) {
        throw new Error(`Duplicate line_item_id "${lineItemId}" in Postgres save payload`)
      }
      seen.add(lineItemId)

      const bursts = resolveLineItemBursts(rawRow)
      let enteredAmount = bursts.reduce(
        (sum, b) => sum + parseMoney((b as { budget?: unknown }).budget),
        0
      )
      if (enteredAmount <= 0) {
        enteredAmount = parseMoney(raw.totalMedia ?? raw.total_media ?? raw.budget)
      }
      const rate =
        bursts
          .map((b) =>
            parseMoney(
              (b as { buyAmount?: unknown; buy_amount?: unknown }).buyAmount ??
                (b as { buy_amount?: unknown }).buy_amount
            )
          )
          .find((n) => n > 0) ?? 0

      const meta = approvals.get(lineItemId)

      out.push({
        lineItemId,
        channel: channel as LineChannel,
        position: index,
        market: (raw.market as string | undefined) ?? null,
        buyingDemo:
          (raw.buying_demo as string | undefined) ??
          (raw.buyingDemo as string | undefined) ??
          null,
        buyType:
          (raw.buy_type as string | undefined) ??
          (raw.buyType as string | undefined) ??
          null,
        publisher: (raw.publisher as string | undefined) ?? null,
        platform: (raw.platform as string | undefined) ?? null,
        bidStrategy:
          (raw.bid_strategy as string | undefined) ??
          (raw.bidStrategy as string | undefined) ??
          null,
        fixedCostMedia:
          (raw.fixed_cost_media as boolean | undefined) ??
          (raw.fixedCostMedia as boolean | undefined) ??
          null,
        clientPaysForMedia: Boolean(
          raw.client_pays_for_media ?? raw.clientPaysForMedia ?? false
        ),
        budgetIncludesFees: Boolean(
          raw.budget_includes_fees ?? raw.budgetIncludesFees ?? false
        ),
        noAdserving: Boolean(raw.no_adserving ?? raw.noAdserving ?? false),
        bursts,
        attrs: pickAttrs(raw),
        mediaType,
        rate,
        enteredAmount,
        feePct: meta?.feePct,
        approval: meta?.approval ?? "approved",
        label: meta?.label,
        billingOverride: meta?.billingOverride,
        feeOverride: meta?.feeOverride,
      })
    })
  }

  return out
}

export type PlansSaveRequestBody = {
  masterId: number
  mbaNumber: string
  versionNumber: number
  mode: SavePlanMode
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
  lineItems: SavePlanLineItem[]
  feeLoading: FeeLoading
  feeSnapshot?: Record<string, unknown>
  adservaudio?: number
  /** Create-path: insert PG master with this id when missing (ETL-aligned). */
  ensureMaster?: {
    mbaNumber: string
    mpClientName?: string | null
    campaignName?: string | null
    campaignStatus?: string | null
    campaignStartDate?: string | null
    campaignEndDate?: string | null
    campaignBudgetCents?: number | null
    clientId?: number | null
  }
  /** PC7 stale-base check — tip version id at edit open. */
  baseVersionId?: number | null
}

export type PlansSaveResponse = {
  versionId: number
  lineCount: number
  scheduleRowCount: number
  published: boolean
  mirror?: "ok" | "failed"
  mirrorDurationMs?: number
  mirrorError?: string
  error?: string
  code?: string
  lineItemId?: string
  compare?: {
    baseVersionId: number
    currentVersionId: number
    sections: { base: string; yours: string; current: string }
  }
}

export async function postPlansSave(
  body: PlansSaveRequestBody
): Promise<
  | { ok: true; data: PlansSaveResponse }
  | { ok: false; status: number; data: PlansSaveResponse }
> {
  const res = await fetch("/api/plans/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as PlansSaveResponse
  if (!res.ok) {
    return { ok: false, status: res.status, data }
  }
  return { ok: true, data }
}

/** Modal step names for the Postgres transactional path (T4c). */
export const POSTGRES_SAVE_MODAL_STEPS = [
  "Save plan (transactional)",
  "Mirror to Xano",
  "KPI sync",
] as const

export function dollarsToCampaignBudgetCents(
  dollars: unknown
): number | null {
  const n =
    typeof dollars === "number"
      ? dollars
      : parseMoneyInput(dollars as string | number | null | undefined)
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/**
 * Combined MBA GET / version payload uses `id` as the **version** row id when
 * `media_plan_master_id` is present and differs. Postgres save must send the
 * master id (ETL-aligned with Xano), never the version id.
 */
export function resolveMasterIdFromCombinedPlan(
  plan:
    | {
        id?: unknown
        media_plan_master_id?: unknown
        mediaPlanMasterId?: unknown
      }
    | null
    | undefined
): number | null {
  if (!plan) return null
  const fromFk = Number(plan.media_plan_master_id ?? plan.mediaPlanMasterId)
  if (Number.isFinite(fromFk) && fromFk > 0) return fromFk
  const id = Number(plan.id)
  if (Number.isFinite(id) && id > 0) return id
  return null
}
