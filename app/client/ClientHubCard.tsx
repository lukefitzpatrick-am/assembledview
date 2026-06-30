import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ClientHubSummary } from '@/lib/types/dashboard'

function clientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

export function ClientHubCard({ row }: { row: ClientHubSummary }) {
  const hasActiveCampaigns = row.liveCampaigns > 0

  return (
    <Link
      href={`/client/${encodeURIComponent(row.slug)}`}
      className="block focus:outline-none"
    >
      <Card className="h-full overflow-hidden rounded-card border border-border bg-card shadow-e1 transition hover:-translate-y-0.5 hover:shadow-e2 focus-within:ring-2 focus-within:ring-ring">
        <div className="h-[3px] bg-primary" aria-hidden />
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-pacing-on-track-bg text-xs font-semibold text-status-on-track-fg">
              {clientInitials(row.clientName)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-lg font-semibold leading-snug line-clamp-2">
                {row.clientName}
              </CardTitle>
              <CardDescription className="text-xs">View dashboard &amp; details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Active campaigns</span>
            <Badge variant={hasActiveCampaigns ? "on-track" : "secondary"} size="sm" className="num">
              {row.liveCampaigns}
            </Badge>
          </div>
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">FY spend</span>
            <span className="num font-semibold">${row.totalSpend.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
