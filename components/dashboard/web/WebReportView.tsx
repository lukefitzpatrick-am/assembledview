"use client"

import { Component, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/layout/PageHeader"
import { CustomRangeFields } from "@/components/dashboard/web/CustomRangeFields"
import { WebReportElement } from "@/components/dashboard/web/reportElements"
import { columnSpanClass } from "@/lib/webReport/displayModel"
import { resolveWidth, type WebReportLayoutItem } from "@/lib/webReport/elements"
import { REPORT_PERIODS, type DateWindow, type ReportPeriod } from "@/lib/webReport/periods"
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

export const CUSTOM_RANGE_LABEL = "Custom range"

const VIEW_FIELD_CLASS = "h-9 rounded-input border border-border bg-card px-2 text-sm text-foreground"

/** Shareable link for a custom range. */
export function customRangeHref(slug: string, range: DateWindow): string {
  return `/dashboard/${slug}/web?from=${range.from}&to=${range.to}`
}

export function PeriodSelect({ slug, period, range = null }: { slug: string; period: ReportPeriod; range?: DateWindow | null }) {
  const router = useRouter()
  const [custom, setCustom] = useState(range != null)
  return (
    <div className="flex flex-col items-end gap-2">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Period
        <select
          className={VIEW_FIELD_CLASS}
          value={custom ? "custom" : period}
          onChange={(event) => {
            const next = event.target.value
            if (next === "custom") {
              setCustom(true)
              return
            }
            setCustom(false)
            router.push(`/dashboard/${slug}/web?period=${next}`)
          }}
        >
          {REPORT_PERIODS.map((value) => (
            <option key={value} value={value}>
              {PERIOD_LABEL[value]}
            </option>
          ))}
          <option value="custom">{CUSTOM_RANGE_LABEL}</option>
        </select>
      </label>
      {custom ? (
        <CustomRangeFields
          initial={range}
          fieldClassName={VIEW_FIELD_CLASS}
          onApply={(next) => router.push(customRangeHref(slug, next))}
        />
      ) : null}
    </div>
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
  range = null,
}: {
  slug: string
  clientName: string
  period: ReportPeriod
  layout: WebReportLayoutItem[]
  data: WebReportData
  connected: boolean
  builderHref?: string | null
  interactivePeriod?: boolean
  /** A custom from/to range from the URL. Null for a preset. */
  range?: DateWindow | null
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
              <PeriodSelect slug={slug} period={period} range={range} />
            ) : (
              <p className="text-sm text-muted-foreground">{range ? CUSTOM_RANGE_LABEL : PERIOD_LABEL[period]}</p>
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
