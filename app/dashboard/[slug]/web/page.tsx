import { notFound, redirect } from "next/navigation"

import { WebReportView } from "@/components/dashboard/web/WebReportView"
import { auth0 } from "@/lib/auth0"
import { getPrimaryRole, getUserClientSlugs, hasRole } from "@/lib/rbac"
import { isWebSearchEnabled } from "@/lib/webReport/featureFlag"
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
  if (!isWebSearchEnabled(slug)) notFound()

  const session = await auth0.getSession()
  const user = session?.user
  if (!user) {
    redirect(`/auth/login?returnTo=/dashboard/${slug}/web`)
  }

  const role = getPrimaryRole(user)
  const userClientSlugs = getUserClientSlugs(user)
  if (role === "client") {
    if (userClientSlugs.length === 0 || !userClientSlugs.includes(slug.toLowerCase())) {
      notFound()
    }
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

  const period: ReportPeriod = isReportPeriod(periodParam) ? periodParam : report.data.windows.period

  return (
    <WebReportView
      slug={slug}
      clientName={report.clientName}
      period={period}
      layout={report.layout}
      data={report.data}
      connected={report.connected}
      builderHref={hasRole(user, ["admin"]) ? `/dashboard/${slug}/web/builder` : null}
    />
  )
}
