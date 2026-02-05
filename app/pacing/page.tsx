import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import PacingPageClient from "@/app/pacing/components/PacingPageClient"
import { listSavedPacingViewsAction } from "@/app/pacing/actions"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import { getMelbourneYesterdayISO } from "@/lib/dates/melbourne"
import { normalisePlan, type PlannedLineItem } from "@/lib/pacing/plan/normalisePlan"
import { computePlannedDeliverableToDate, computePlannedSpendToDate, getBurstBounds } from "@/lib/pacing/plan/normalisePlan"
import { mapDeliverableMetric } from "@/lib/pacing/deliverables/mapDeliverableMetric"

type DateWindowKey = "LAST_30" | "LAST_60" | "LAST_90" | "CAMPAIGN_DATES"

export default async function PacingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const session = await auth0.getSession()
  const user = session?.user

  if (!user) {
    redirect("/auth/login?returnTo=/pacing")
  }

  const roles = getUserRoles(user)
  const isAdmin = roles.includes("admin")

  if (!isAdmin) {
    redirect("/unauthorized")
  }

  const selectedViewIdRaw = searchParams?.view
  const selectedViewId =
    typeof selectedViewIdRaw === "string" && selectedViewIdRaw.trim()
      ? selectedViewIdRaw.trim()
      : null

  const windowRaw = searchParams?.window
  const requestedWindow =
    typeof windowRaw === "string" && windowRaw.trim() ? windowRaw.trim() : null

  // Load views server-side so we can SSR the selector.
  // If Xano isn’t configured yet, fail soft and render empty.
  const viewsResult = await listSavedPacingViewsAction()
  const initialViews = viewsResult.ok ? viewsResult.views : []

  const selectedView = selectedViewId
    ? initialViews.find((v) => String(v.id) === String(selectedViewId))
    : null

  type PaceStatus = "UNDER" | "ON" | "OVER"
  const classifyPace = (actual: number, plannedToDate: number): PaceStatus | null => {
    const a = Number(actual ?? 0)
    const p = Number(plannedToDate ?? 0)
    if (p <= 0) {
      if (a <= 0) return "ON"
      return "OVER"
    }
    const ratio = a / p
    if (ratio < 0.9) return "UNDER"
    if (ratio > 1.1) return "OVER"
    return "ON"
  }

  type PortfolioDailyRow = {
    lineItemId: string
    date: string
    amountSpent: number
    impressions: number
    clicks: number
    results: number
    video3sViews: number
  }

  type PortfolioLineItem = PlannedLineItem & {
    spendToDate: number
    plannedSpendToDate: number
    spendPaceStatus: PaceStatus | null
    deliverableMetric: ReturnType<typeof mapDeliverableMetric>
    deliverableToDate: number
    plannedDeliverableToDate: number
    deliverablePaceStatus: PaceStatus | null
  }

  type PortfolioCampaign = {
    mbaNumber: string
    campaignName: string
    spendToDate: number
    plannedSpendToDate: number
    paceStatus: PaceStatus | null
    lineItems: PortfolioLineItem[]
  }

  type PortfolioClientGroup = {
    clientSlug: string
    campaigns: PortfolioCampaign[]
  }

  type PortfolioData = {
    dataAsAt: string
    window: { startDate: string; endDate: string; key: string }
    totals: {
      plannedTotal: number
      spentToDate: number
      underCount: number
      onCount: number
      overCount: number
    }
    clients: PortfolioClientGroup[]
    deliveryDaily: PortfolioDailyRow[]
  } | null

  let portfolio: PortfolioData = null
  let initialWindowKey: string | null = null

  if (selectedView && Array.isArray(selectedView.client_slugs) && selectedView.client_slugs.length) {
    try {
      const clientSlugSet = new Set(selectedView.client_slugs.map((s) => String(s).trim()).filter(Boolean))

      // 1) Fetch media_plan_versions and filter to selected clients, keeping latest per mba_number
      const versionsUrl = xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
      const allVersions = await fetchAllXanoPages(versionsUrl, {}, "PACING_VERSIONS", 200, 50)

      const parseVersion = (value: any): number => {
        const n = typeof value === "string" ? parseInt(value, 10) : Number(value)
        return Number.isFinite(n) ? n : 0
      }
      const norm = (v: any) => String(v ?? "").trim().toLowerCase()
      const slugify = (value: any): string => {
        const s = String(value ?? "").trim().toLowerCase()
        if (!s) return ""
        return s
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/(^-|-$)+/g, "")
      }

      const latestByMba = new Map<string, any>()
      ;(allVersions ?? []).forEach((v: any) => {
        const mba = String(v?.mba_number ?? "").trim()
        if (!mba) return
        const clientName = v?.client_name ?? v?.mp_client_name ?? v?.mp_clientname
        const clientSlug = slugify(clientName)
        if (!clientSlug || !clientSlugSet.has(clientSlug)) return

        const current = latestByMba.get(mba)
        const nextVer = parseVersion(v?.version_number)
        const curVer = parseVersion(current?.version_number)
        if (!current || nextVer > curVer) {
          latestByMba.set(mba, v)
        }
      })

      const latestVersions = Array.from(latestByMba.values())

      // 2) Fetch line items for the selected campaigns (social + prog display + prog video)
      const filterByMbaAndVersion = (items: any[], mbaNumber: string, versionNumber: number, mediaPlanVersionId?: number | null) => {
        if (!Array.isArray(items)) return []
        const normalizedMba = norm(mbaNumber)
        const versionStr = String(versionNumber)
        const versionIdStr =
          mediaPlanVersionId !== null && mediaPlanVersionId !== undefined ? String(mediaPlanVersionId) : null

        return items.filter((item) => {
          if (norm(item?.mba_number) !== normalizedMba) return false

          const mpPlanNumber = item?.mp_plannumber ?? item?.mp_plan_number ?? item?.mpPlanNumber
          const mediaPlanVersion = item?.media_plan_version
          const mediaPlanVersionIdField = item?.media_plan_version_id ?? item?.media_plan_versionID
          const versionNumberField = item?.version_number

          const hasVersionIdCandidate =
            (mediaPlanVersion !== null && mediaPlanVersion !== undefined && String(mediaPlanVersion).trim() !== "") ||
            (mediaPlanVersionIdField !== null && mediaPlanVersionIdField !== undefined && String(mediaPlanVersionIdField).trim() !== "")

          if (versionIdStr && hasVersionIdCandidate) {
            const candidates = [mediaPlanVersion, mediaPlanVersionIdField]
            return candidates.some((value) => String(value ?? "").trim() === versionIdStr)
          }

          const versionCandidates = [mpPlanNumber, versionNumberField]
          return versionCandidates.some((value) => String(value ?? "").trim() === versionStr)
        })
      }

      async function fetchLineItemsForCampaign(endpoint: string, mbaNumber: string, versionNumber: number, versionId?: number | null) {
        const url = xanoUrl(endpoint, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
        const attempts: Array<Record<string, string | number | boolean | null | undefined>> = [
          ...(versionId !== null && versionId !== undefined
            ? [{ mba_number: mbaNumber, media_plan_version: versionId }, { mba_number: mbaNumber, media_plan_version_id: versionId }]
            : []),
          { mba_number: mbaNumber, mp_plannumber: versionNumber },
          { mba_number: mbaNumber, version_number: versionNumber },
          { mba_number: mbaNumber, media_plan_version: versionNumber },
        ]

        let best: any[] = []
        let bestRawCount = Number.POSITIVE_INFINITY

        for (const params of attempts) {
          const raw = await fetchAllXanoPages(url, params, `PACING_${endpoint}`, 200, 20)
          const filtered = filterByMbaAndVersion(raw, mbaNumber, versionNumber, versionId)
          if (
            filtered.length > best.length ||
            (filtered.length === best.length && raw.length < bestRawCount)
          ) {
            best = filtered
            bestRawCount = raw.length
          }
          if (raw.length > 0 && raw.length === filtered.length) {
            break
          }
        }

        return best
      }

      const socialRows: any[] = []
      const progDisplayRows: any[] = []
      const progVideoRows: any[] = []

      const perCampaign = await Promise.all(
        latestVersions.map(async (v) => {
          const mbaNumber = String(v?.mba_number ?? "").trim()
          const versionNumber = parseVersion(v?.version_number)
          const versionId = v?.id !== undefined && v?.id !== null ? Number(v.id) : null
          if (!mbaNumber) return { s: [], pd: [], pv: [] }

          const [s, pd, pv] = await Promise.all([
            fetchLineItemsForCampaign(
              "media_plan_social",
              mbaNumber,
              versionNumber,
              Number.isFinite(versionId as any) ? versionId : null
            ),
            fetchLineItemsForCampaign(
              "media_plan_prog_display",
              mbaNumber,
              versionNumber,
              Number.isFinite(versionId as any) ? versionId : null
            ),
            fetchLineItemsForCampaign(
              "media_plan_prog_video",
              mbaNumber,
              versionNumber,
              Number.isFinite(versionId as any) ? versionId : null
            ),
          ])

          return { s, pd, pv }
        })
      )

      perCampaign.forEach(({ s, pd, pv }) => {
        socialRows.push(...(Array.isArray(s) ? s : []))
        progDisplayRows.push(...(Array.isArray(pd) ? pd : []))
        progVideoRows.push(...(Array.isArray(pv) ? pv : []))
      })

      // 3) Normalize planned line items
      const plannedLineItems = normalisePlan({
        mediaPlanVersions: latestVersions,
        mediaPlanSocial: socialRows,
        mediaPlanProgrammaticDisplay: progDisplayRows,
        mediaPlanProgrammaticVideo: progVideoRows,
      })

      const yesterdayISO = getMelbourneYesterdayISO()
      const viewDefault = selectedView.defaultDateWindow ?? "LAST_60"
      const windowKey = (requestedWindow ?? viewDefault ?? "LAST_60") as DateWindowKey
      initialWindowKey = windowKey

      const window = (() => {
        if (windowKey === "LAST_30") return { startDate: (() => {
          const d = new Date(yesterdayISO + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 29); return d.toISOString().slice(0,10)
        })(), endDate: yesterdayISO }
        if (windowKey === "LAST_90") return { startDate: (() => {
          const d = new Date(yesterdayISO + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 89); return d.toISOString().slice(0,10)
        })(), endDate: yesterdayISO }
        if (windowKey === "CAMPAIGN_DATES") {
          const bounds = getBurstBounds(plannedLineItems.flatMap((li) => li.bursts))
          const startDate = bounds.startDate ?? (() => {
            const d = new Date(yesterdayISO + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 59); return d.toISOString().slice(0,10)
          })()
          const rawEnd = bounds.endDate ?? yesterdayISO
          const endDate = rawEnd > yesterdayISO ? yesterdayISO : rawEnd
          return { startDate, endDate }
        }
        // default LAST_60
        return { startDate: (() => {
          const d = new Date(yesterdayISO + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 59); return d.toISOString().slice(0,10)
        })(), endDate: yesterdayISO }
      })()

      const lineItemIds = plannedLineItems.map((li) => li.lineItemId).filter(Boolean)

      // 4) Fetch delivery via /api/pacing/portfolio
      const h = await headers()
      const proto = h.get("x-forwarded-proto") ?? "http"
      const host = h.get("host") ?? "localhost:3000"
      const baseUrl = `${proto}://${host}`
      const portfolioRes = await fetch(`${baseUrl}/api/pacing/portfolio`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          cookie: h.get("cookie") ?? "",
        },
        body: JSON.stringify({
          lineItemIds,
          startDate: window.startDate,
          endDate: window.endDate,
        }),
      })

      const portfolioJson = await portfolioRes.json()
      const deliveryDaily = Array.isArray(portfolioJson?.daily) ? (portfolioJson.daily as PortfolioDailyRow[]) : []
      const deliveryTotals = Array.isArray(portfolioJson?.totals) ? portfolioJson.totals : []
      const dataAsAt = String(portfolioJson?.dataAsAt ?? window.endDate).slice(0, 10)

      const totalsById = new Map<string, any>()
      deliveryTotals.forEach((t: any) => {
        const id = String(t?.lineItemId ?? "").trim().toLowerCase()
        if (!id) return
        totalsById.set(id, t)
      })

      // 5) Join plan + delivery and compute statuses
      const computedLineItems: PortfolioLineItem[] = plannedLineItems.map((li) => {
        const totals = totalsById.get(li.lineItemId) ?? null
        const spendToDate = Number(totals?.amountSpent ?? 0)
        const plannedSpendToDate = computePlannedSpendToDate(li.bursts, dataAsAt)
        const spendPaceStatus = classifyPace(spendToDate, plannedSpendToDate)

        const deliverableMetric = mapDeliverableMetric({
          channel: li.channelGroup,
          buyType: li.buyType,
          platform: li.platform,
        })
        const deliverableToDate = (() => {
          switch (deliverableMetric) {
            case "CLICKS":
              return Number(totals?.clicks ?? 0)
            case "RESULTS":
              return Number(totals?.results ?? 0)
            case "VIDEO_3S_VIEWS":
              return Number(totals?.video3sViews ?? 0)
            case "IMPRESSIONS":
            default:
              return Number(totals?.impressions ?? 0)
          }
        })()
        const plannedDeliverableToDate = computePlannedDeliverableToDate(li.bursts, dataAsAt)
        const deliverablePaceStatus = classifyPace(deliverableToDate, plannedDeliverableToDate)

        return {
          ...li,
          spendToDate,
          plannedSpendToDate,
          spendPaceStatus,
          deliverableMetric,
          deliverableToDate,
          plannedDeliverableToDate,
          deliverablePaceStatus,
        }
      })

      // 6) Roll up to Campaign, then Client
      const campaignsByKey = new Map<string, PortfolioCampaign>()
      computedLineItems.forEach((li) => {
        const key = `${li.clientSlug}::${li.mbaNumber}::${li.campaignName}`
        const existing = campaignsByKey.get(key) ?? {
          mbaNumber: li.mbaNumber,
          campaignName: li.campaignName,
          spendToDate: 0,
          plannedSpendToDate: 0,
          paceStatus: null,
          lineItems: [],
        }
        existing.spendToDate += li.spendToDate
        existing.plannedSpendToDate += li.plannedSpendToDate
        existing.lineItems.push(li)
        campaignsByKey.set(key, existing)
      })

      const campaigns = Array.from(campaignsByKey.entries()).map(([key, c]) => {
        const paceStatus = classifyPace(c.spendToDate, c.plannedSpendToDate)
        return { ...c, paceStatus, _key: key }
      })

      const clientsBySlug = new Map<string, PortfolioClientGroup>()
      campaigns.forEach((c: any) => {
        const [clientSlug] = String(c._key).split("::")
        const group = clientsBySlug.get(clientSlug) ?? { clientSlug, campaigns: [] }
        group.campaigns.push({
          mbaNumber: c.mbaNumber,
          campaignName: c.campaignName,
          spendToDate: c.spendToDate,
          plannedSpendToDate: c.plannedSpendToDate,
          paceStatus: c.paceStatus,
          lineItems: c.lineItems,
        })
        clientsBySlug.set(clientSlug, group)
      })

      const clientsGrouped = Array.from(clientsBySlug.values()).map((g) => {
        g.campaigns.sort((a, b) => a.campaignName.localeCompare(b.campaignName))
        return g
      })
      clientsGrouped.sort((a, b) => a.clientSlug.localeCompare(b.clientSlug))

      const plannedTotal = computedLineItems.reduce((sum, li) => sum + (li.totalBudgetNumber ?? 0), 0)
      const spentToDate = computedLineItems.reduce((sum, li) => sum + (li.spendToDate ?? 0), 0)
      const counts = campaigns.reduce(
        (acc, c: any) => {
          if (c.paceStatus === "UNDER") acc.under += 1
          else if (c.paceStatus === "OVER") acc.over += 1
          else if (c.paceStatus === "ON") acc.on += 1
          return acc
        },
        { under: 0, on: 0, over: 0 }
      )

      portfolio = {
        dataAsAt,
        window: { ...window, key: windowKey },
        totals: {
          plannedTotal,
          spentToDate,
          underCount: counts.under,
          onCount: counts.on,
          overCount: counts.over,
        },
        clients: clientsGrouped,
        deliveryDaily,
      }
    } catch (err) {
      console.warn("[pacing] failed to load portfolio data", err)
      portfolio = null
    }
  }

  return (
    <PacingPageClient
      initialViews={initialViews}
      initialSelectedViewId={selectedViewId}
      initialWindowKey={initialWindowKey}
      portfolio={portfolio}
    />
  )
}

