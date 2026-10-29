import Link from "next/link"
import { Check, X } from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/ui/status-pill"
import {
  platformAccountsHref,
  webReportBuilderHref,
  webReportStateTone,
  type WebReportAdminStatus,
} from "@/lib/webReport/admin/status"

/** Staff-only notices on `/dashboard/[slug]/web`. Clients never see these. */

export const FLAG_OFF_NOTICE =
  "Web & search is switched off for everyone (FEATURE_WEB_SEARCH). Clients cannot see this tab. You can still check the report here."

export const DRAFT_STRIP = "Draft. The client cannot see this yet. Publish in the builder."

export const ACCOUNTS_STRIP =
  "No GA4 property or Search Console site is connected, so this report shows no web data."

export function WebSearchFlagOffNotice() {
  return (
    <section
      role="status"
      className="rounded-card border border-border bg-card px-4 py-3 text-sm text-foreground"
      data-testid="web-search-flag-off"
    >
      <p>{FLAG_OFF_NOTICE}</p>
    </section>
  )
}

export function WebReportAdminStrip({
  slug,
  strip,
  status,
}: {
  slug: string
  strip: "draft" | "accounts_missing"
  status: WebReportAdminStatus | null
}) {
  const message = strip === "draft" ? DRAFT_STRIP : ACCOUNTS_STRIP
  const notVisible = strip === "accounts_missing" && status && !status.published
  return (
    <section
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-3 text-sm"
      data-testid={`web-report-strip-${strip}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {status ? <StatusPill tone={webReportStateTone(status.state)} label={status.label} size="sm" /> : null}
        <p className="text-foreground">
          {message}
          {notVisible ? " The client cannot see it yet." : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {strip === "accounts_missing" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={platformAccountsHref(slug)}>Connect accounts</Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link href={webReportBuilderHref(slug)}>Open builder</Link>
        </Button>
      </div>
    </section>
  )
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? Check : X
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-foreground">{label}</span>
      <span className="text-muted-foreground">{done ? "Yes" : "No"}</span>
    </li>
  )
}

/** No `client_web_reports` row yet: what is missing and where to fix it. */
export function WebReportSetupState({
  slug,
  clientName,
  status,
  flagOff,
}: {
  slug: string
  clientName: string
  status: WebReportAdminStatus
  flagOff: boolean
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6">
      {flagOff ? <WebSearchFlagOffNotice /> : null}
      <PageHeader
        title={clientName}
        accent="Web & search"
        lede={<p>No Web & search report for {clientName} yet.</p>}
      />
      <section
        className="flex flex-col gap-4 rounded-card border border-border bg-card p-4"
        data-testid="web-report-setup"
      >
        <ul className="flex flex-col gap-2" aria-label="Web & search setup checklist">
          <ChecklistRow done={status.ga4Connected} label="GA4 property connected" />
          <ChecklistRow done={status.gscConnected} label="Search Console site connected" />
          <ChecklistRow done={status.published} label="Report published" />
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={platformAccountsHref(slug)}>Connect accounts</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={webReportBuilderHref(slug)}>Build report</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
