"use client"

import Link from "next/link"

import { BUILDER_FIELD_CLASS } from "@/components/dashboard/web/builder/SettingsControl"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/webReport/periods"

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  last_month: "Last month",
  last_28_days: "Last 28 days",
  month_to_date_yoy: "This month last year",
}

export function editAccountsHref(slug: string): string {
  return `/client/${slug}#platform-accounts`
}

export function BuilderTopBar({
  slug,
  clientName,
  period,
  onPeriod,
  terms,
  onTerms,
  ga4PropertyRef,
  gscSiteRef,
  clientView,
  onClientView,
  canSave,
  saving,
  onSave,
  version,
  history,
  restoring,
  onRestore,
  message,
}: {
  slug: string
  clientName: string
  period: ReportPeriod
  onPeriod: (period: ReportPeriod) => void
  terms: string
  onTerms: (terms: string) => void
  ga4PropertyRef: string | null
  gscSiteRef: string | null
  clientView: boolean
  onClientView: (on: boolean) => void
  canSave: boolean
  saving: boolean
  onSave: () => void
  version: number
  history: { version: number; savedAt: string | null }[]
  restoring: boolean
  onRestore: (version: number) => void
  message: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Report builder"
        accent={clientName}
        punctuate={false}
        lede={<p>Click an element in the report to change how it looks. Saving publishes it to the client.</p>}
        meta={message ? <p>{message}</p> : null}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-pressed={clientView}
              onClick={() => onClientView(!clientView)}
            >
              {clientView ? "Back to editing" : "View as client"}
            </Button>
            <Button type="button" variant="action" className="min-h-11" disabled={!canSave} onClick={onSave}>
              {saving ? "Publishing" : "Save and publish"}
            </Button>
          </div>
        }
      />

      <section
        aria-label="Report settings"
        className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-e1 md:grid-cols-2 xl:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Period
          <select
            className={BUILDER_FIELD_CLASS}
            value={period}
            onChange={(event) => onPeriod(event.target.value as ReportPeriod)}
          >
            {REPORT_PERIODS.map((value) => (
              <option key={value} value={value}>
                {PERIOD_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Brand terms
          <Input className="h-11" value={terms} placeholder="brand, product" onChange={(event) => onTerms(event.target.value)} />
        </label>
        <div className="flex flex-col gap-1 text-sm text-foreground">
          <span>Linked accounts</span>
          <p className="text-sm text-muted-foreground">
            Google Analytics 4 <span className="num text-foreground">{ga4PropertyRef ?? "Not linked"}</span>
          </p>
          <p className="truncate text-sm text-muted-foreground">
            Search Console <span className="text-foreground">{gscSiteRef ?? "Not linked"}</span>
          </p>
          <Link href={editAccountsHref(slug)} className="text-sm font-semibold text-primary hover:underline">
            Edit accounts
          </Link>
        </div>
        <div className="flex flex-col gap-1 text-sm text-foreground">
          <span>
            Published version <span className="num">{version > 0 ? version : "none"}</span>
          </span>
          {history.length > 0 ? (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary">Version history</summary>
              <div className="mt-1 flex flex-col gap-1">
                {history.map((row) => (
                  <Button
                    key={row.version}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={restoring || row.version === version}
                    onClick={() => onRestore(row.version)}
                  >
                    Restore version <span className="num">{row.version}</span>
                  </Button>
                ))}
              </div>
            </details>
          ) : (
            <p className="text-sm text-muted-foreground">No saved versions yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
