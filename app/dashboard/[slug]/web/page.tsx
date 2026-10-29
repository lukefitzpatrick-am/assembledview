import { notFound, redirect } from "next/navigation"

import {
  WebReportAdminStrip,
  WebReportSetupState,
  WebSearchFlagOffNotice,
} from "@/components/dashboard/web/WebReportAdminNotices"
import { WebReportView } from "@/components/dashboard/web/WebReportView"
import { getClientDashboardData } from "@/lib/api/dashboard"
import { auth0 } from "@/lib/auth0"
import { getPrimaryRole, getUserClientSlugs, hasRole } from "@/lib/rbac"
import { resolveWebPageMode } from "@/lib/webReport/admin/pageMode"
import { loadWebReportStatusForSlug } from "@/lib/webReport/admin/statusLoad"
import { isWebSearchFlagOn, webSearchFlagBlocks } from "@/lib/webReport/featureFlag"
import { isWebReportPublished } from "@/lib/webReport/visibility"
import { loadWebReportResponse, WebReportRangeError } from "@/lib/webReport/loadPage"
import { isReportPeriod, type ReportPeriod } from "@/lib/webReport/periods"

interface WebSearchPageProps {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ period?: string | string[]; from?: string | string[]; to?: string | string[] }>
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default async function WebSearchPage({ params, searchParams }: WebSearchPageProps) {
  const { slug } = await params

  const session = await auth0.getSession()
  const user = session?.user
  if (!user) {
    redirect(`/auth/login?returnTo=/dashboard/${slug}/web`)
  }

  const isAdmin = hasRole(user, ["admin"])
  const flagOn = isWebSearchFlagOn()
  // Clients keep the 404 when the switch is off. Admins get a notice instead.
  if (webSearchFlagBlocks({ isAdmin, flagOn })) notFound()

  const role = getPrimaryRole(user)
  const userClientSlugs = getUserClientSlugs(user)
  if (role === "client") {
    if (userClientSlugs.length === 0 || !userClientSlugs.includes(slug.toLowerCase())) {
      notFound()
    }
    // Clients see the tab only after the report has been saved and published.
    if (!(await isWebReportPublished(slug))) notFound()
  }

  const statusResult = isAdmin ? await loadWebReportStatusForSlug(slug) : null
  const mode = resolveWebPageMode({
    isAdmin,
    flagOn,
    status: statusResult?.ok ? statusResult.status : null,
  })
  if (mode.kind === "not_found") notFound()

  if (mode.kind === "admin_setup") {
    const dashboard = await getClientDashboardData(slug)
    if (!dashboard) notFound()
    return (
      <WebReportSetupState
        slug={slug}
        clientName={dashboard.clientName}
        status={mode.status}
        flagOff={mode.flagOff}
      />
    )
  }

  const sp = searchParams ? await searchParams : undefined
  const periodParam = first(sp?.period)
  const from = first(sp?.from)
  const to = first(sp?.to)
  if (periodParam && !isReportPeriod(periodParam)) notFound()
  if (Boolean(from) !== Boolean(to)) notFound()

  let report: Awaited<ReturnType<typeof loadWebReportResponse>>
  try {
    report = await loadWebReportResponse({
      slug,
      period: periodParam,
      from,
      to,
    })
  } catch (error) {
    if (error instanceof WebReportRangeError) notFound()
    throw error
  }
  if (!report) notFound()

  const windowPeriod = report.data.windows.period
  const period: ReportPeriod = isReportPeriod(periodParam)
    ? periodParam
    : windowPeriod === "custom"
      ? report.defaultPeriod
      : windowPeriod
  const range = windowPeriod === "custom" ? report.data.windows.current : null

  const notices =
    mode.kind === "admin_report" && (mode.flagOff || mode.strip) ? (
      <>
        {mode.flagOff ? <WebSearchFlagOffNotice /> : null}
        {mode.strip ? <WebReportAdminStrip slug={slug} strip={mode.strip} status={mode.status} /> : null}
      </>
    ) : null

  return (
    <WebReportView
      slug={slug}
      clientName={report.clientName}
      period={period}
      layout={report.layout}
      data={report.data}
      connected={report.connected}
      range={range}
      builderHref={isAdmin ? `/dashboard/${slug}/web/builder` : null}
      notices={notices}
    />
  )
}
