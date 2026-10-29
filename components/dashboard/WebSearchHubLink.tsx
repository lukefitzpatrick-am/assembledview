import Link from "next/link"
import { Globe } from "lucide-react"

import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/ui/status-pill"
import {
  webReportStateTone,
  webReportViewerHref,
  type WebReportAdminStatus,
} from "@/lib/webReport/admin/status"

/**
 * Client hub admin action: open the client's Web & search report, with its
 * status chip. A failed status read (null) shows the link without a chip.
 */
export function WebSearchHubLink({ slug, status }: { slug: string; status: WebReportAdminStatus | null }) {
  return (
    <div className="flex items-center gap-2" data-testid="web-search-hub-link">
      <Button asChild size="sm" variant="outline">
        <Link href={webReportViewerHref(slug)}>
          <Globe className="mr-2 h-4 w-4" aria-hidden />
          Web &amp; search
        </Link>
      </Button>
      {status ? <WebSearchStatusChip status={status} /> : null}
    </div>
  )
}

export function WebSearchStatusChip({ status }: { status: WebReportAdminStatus }) {
  return (
    <StatusPill
      tone={webReportStateTone(status.state)}
      label={status.label}
      size="sm"
      className="whitespace-nowrap"
    />
  )
}

/**
 * Client list badge: "Web & search: Published" linking to the report. Hidden
 * when the status is unknown. Not set up is shown so the gap is visible.
 */
export function WebSearchListBadge({ slug, status }: { slug: string; status: WebReportAdminStatus | null | undefined }) {
  if (!status) return null
  return (
    <Link
      href={webReportViewerHref(slug)}
      className="relative z-10 inline-flex items-center gap-1.5 rounded-pill text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Web & search for this client: ${status.label}`}
      data-testid="web-search-list-badge"
    >
      <span>Web &amp; search:</span>
      <WebSearchStatusChip status={status} />
    </Link>
  )
}
