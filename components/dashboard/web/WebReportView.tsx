"use client"

import { Component, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/layout/PageHeader"
import { WebReportElement } from "@/components/dashboard/web/reportElements"
import { columnSpanClass } from "@/lib/webReport/displayModel"
import { resolveWidth, type WebReportLayoutItem } from "@/lib/webReport/elements"
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/webReport/periods"
import type { WebReportData } from "@/lib/webReport/types"

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  last_month: "Last month",
  last_28_days: "Last 28 days",
  month_to_date_yoy: "This month last year",
}

export class ElementBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="rounded-card border border-border bg-card p-4 shadow-e1">
          <h2 className="text-sm font-semibold text-foreground">{this.props.title}</h2>
          <p className="mt-3 text-sm text-muted-foreground">This element could not be loaded.</p>
        </section>
      )
    }
    return this.props.children
  }
}

export function PeriodSelect({ slug, period }: { slug: string; period: ReportPeriod }) {
  const router = useRouter()
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Period
      <select
        className="h-9 rounded-input border border-border bg-card px-2 text-sm text-foreground"
        value={period}
        onChange={(event) => {
          const next = event.target.value
          router.push(`/dashboard/${slug}/web?period=${next}`)
        }}
      >
        {REPORT_PERIODS.map((value) => (
          <option key={value} value={value}>
            {PERIOD_LABEL[value]}
          </option>
        ))}
      </select>
    </label>
  )
}

export function siteLabel(site: string): string {
  return site
    .trim()
    .replace(/^sc-domain:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
}

export function builtFromLine(ga4Property: string | null, gscSite: string | null): string {
  const parts = [
    ga4Property ? `Google Analytics 4 (${ga4Property})` : null,
    gscSite ? `Search Console (${siteLabel(gscSite)})` : null,
    "AV paid media",
  ].filter((part): part is string => part != null)
  const last = parts.pop()
  return `Built from ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}.`
}

export function WebReportView({
  slug,
  clientName,
  period,
  layout,
  data,
  connected,
  builderHref,
  interactivePeriod = true,
}: {
  slug: string
  clientName: string
  period: ReportPeriod
  layout: WebReportLayoutItem[]
  data: WebReportData
  connected: boolean
  builderHref?: string | null
  interactivePeriod?: boolean
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        title={clientName}
        accent={`Web & search, ${data.windows.phrase}`}
        actions={
          <div className="flex items-center gap-3">
            {builderHref ? (
              <Link href={builderHref} className="text-sm font-semibold text-primary hover:underline">
                Edit report
              </Link>
            ) : null}
            {interactivePeriod ? (
              <PeriodSelect slug={slug} period={period} />
            ) : (
              <p className="text-sm text-muted-foreground">{PERIOD_LABEL[period]}</p>
            )}
          </div>
        }
        lede={<p>Compared with {data.windows.comparedWith}.</p>}
        meta={
          connected ? (
            <p>{builtFromLine(data.ga4Property, data.gscSite)}</p>
          ) : (
            <p>Not connected yet.</p>
          )
        }
      />
      {connected ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {layout.map((item, index) => (
            <div key={`${item.elementId}-${index}`} className={columnSpanClass(resolveWidth(item))}>
              <ElementBoundary title={item.elementId}>
                <WebReportElement item={item} data={data} />
              </ElementBoundary>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
