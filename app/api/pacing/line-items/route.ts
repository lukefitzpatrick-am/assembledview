import { NextRequest } from "next/server"
import {
  assertClientsIdsAllowed,
  mergeClientsFilterForIdList,
  parseClientsIdsParam,
  requirePacingAccess,
} from "@/lib/pacing/pacingAuth"
import { applyOverviewFilters, resolveLineItemSnowflakeDateRange } from "@/lib/pacing/composition/applyOverviewFilters"
import { buildLineItemPacingRows } from "@/lib/pacing/composition/buildLineItemPacingRows"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchPortfolioPlan } from "@/lib/pacing/plan/fetchPortfolioPlan"
import {
  buildPlanSlugToClientIdMap,
  fetchPacingClientCatalogRows,
  resolveClientSlugs,
} from "@/lib/pacing/scope/resolveClientSlugs"
import { getPortfolioPacingData, type PortfolioPacingInput } from "@/lib/snowflake/portfolio-pacing-service"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const revalidate = 0

const LINE_ITEMS_RESPONSE_CAP = 10_000

export async function GET(request: NextRequest) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const clientIdsList = parseClientsIdsParam(sp.get("clients_id"))

  if (clientIdsList && clientIdsList.length > 0) {
    const forbiddenMulti = assertClientsIdsAllowed(clientIdsList, gate.allowedClientIds)
    if (forbiddenMulti) return forbiddenMulti
  }

  const clientFilter = mergeClientsFilterForIdList(clientIdsList, gate.allowedClientIds)

  const slugResolveIds: number[] | null =
    clientFilter.mode === "all" ? null : clientFilter.mode === "none" ? [] : clientFilter.ids

  const slugClaims = getUserClientSlugs(gate.session.user)
  const roles = getUserRoles(gate.session.user)
  console.log("[pacing-diag] line-items request", {
    auth: {
      isAdmin: roles.includes("admin"),
      hasSlugClaims: Array.isArray(slugClaims) ? slugClaims.length : null,
      allowedClientIds: gate.allowedClientIds,
    },
    params: {
      date_from: sp.get("date_from"),
      date_to: sp.get("date_to"),
      clients_id: sp.get("clients_id"),
      media_type: sp.get("media_type"),
      status: sp.get("status"),
      search: sp.get("search"),
    },
    clientFilter,
  })

  if (clientFilter.mode === "none") {
    console.log("[pacing-diag] line-items SHORT CIRCUIT — clientFilter.mode === none, returning []")
    return pacingJsonOk({ data: [] })
  }

  const mediaMulti = sp.get("media_type")?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
  const statusMulti = sp.get("status")?.split(",").map((s) => s.trim()).filter(Boolean) ?? []

  try {
    const mpRaw = sp.get("media_plan_id")
    const mediaPlanId =
      mpRaw && mpRaw.trim() ? Number.parseInt(mpRaw.trim(), 10) : null

    const catalogRows = await fetchPacingClientCatalogRows()
    const clientSlugs = await resolveClientSlugs(slugResolveIds, {
      fetchRows: async () => catalogRows,
    })

    if (clientSlugs.length === 0) {
      console.log("[pacing-diag] line-items SHORT CIRCUIT — no client slugs in scope")
      return pacingJsonOk({ data: [] })
    }

    const { plannedLineItems } = await fetchPortfolioPlan({ clientSlugs })

    const lineItemIds = [...new Set(plannedLineItems.map((li) => li.lineItemId))]

    if (lineItemIds.length === 0) {
      console.log("[pacing-diag] line-items — no planned line items in scope")
      return pacingJsonOk({ data: [] })
    }

    const { dateFrom, dateTo } = resolveLineItemSnowflakeDateRange(sp.get("date_from"), sp.get("date_to"))

    const portfolioInput: PortfolioPacingInput = {
      lineItemIds,
      startDate: dateFrom,
      endDate: dateTo,
    }

    const { daily } = await getPortfolioPacingData(portfolioInput)

    console.log("[pacing-diag] line-items portfolio fetch", {
      lineItemIds: lineItemIds.length,
      dailyRows: daily.length,
      dateFrom,
      dateTo,
    })

    const clientIdByPlanSlug = buildPlanSlugToClientIdMap(catalogRows)

    const composed = buildLineItemPacingRows({
      plannedLineItems,
      dailyRows: daily,
      clientIdByPlanSlug,
      onOrphanDelivery: (id) =>
        console.warn("[pacing-diag] line-items orphan delivery (no plan line item)", { id }),
    })

    const filtered = applyOverviewFilters(composed, {
      mediaTypeParam: mediaMulti.length ? mediaMulti.join(",") : sp.get("media_type"),
      statusParam: statusMulti.length ? statusMulti.join(",") : sp.get("status"),
      search: sp.get("search"),
      mediaPlanId: mediaPlanId !== null && Number.isFinite(mediaPlanId) ? mediaPlanId : null,
    })

    const capped =
      filtered.length > LINE_ITEMS_RESPONSE_CAP
        ? filtered.slice(0, LINE_ITEMS_RESPONSE_CAP)
        : filtered

    if (filtered.length > LINE_ITEMS_RESPONSE_CAP) {
      console.warn("[pacing-diag] line-items response capped", {
        total: filtered.length,
        cap: LINE_ITEMS_RESPONSE_CAP,
      })
    }

    return pacingJsonOk({ data: capped })
  } catch (e) {
    console.error("[api/pacing/line-items]", e)
    return pacingJsonError(e instanceof Error ? e.message : "snowflake_error", 500)
  }
}
