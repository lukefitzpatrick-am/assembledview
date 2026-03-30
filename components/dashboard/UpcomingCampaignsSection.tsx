"use client"

import Link from "next/link"
import { CalendarDays, Clock3 } from "lucide-react"

export interface UpcomingCampaignItem {
  id: string
  name: string
  launchDate?: string
  totalBudget: number
  href: string
}

interface UpcomingCampaignsSectionProps {
  campaigns: UpcomingCampaignItem[]
  maxItems?: number
  viewAllHref?: string
}

function formatLaunchDate(value?: string): string {
  if (!value) return "Launch date TBD"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed)
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

export function UpcomingCampaignsSection({
  campaigns,
  maxItems = 4,
  viewAllHref = "#",
}: UpcomingCampaignsSectionProps) {
  const visible = campaigns.slice(0, maxItems)
  const showViewAll = campaigns.length > maxItems

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Coming up</h2>
        {showViewAll ? (
          <Link href={viewAllHref} className="text-sm text-primary hover:underline">
            View all planned →
          </Link>
        ) : null}
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((campaign) => (
            <Link
              key={campaign.id}
              href={campaign.href}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium text-foreground">{campaign.name}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatLaunchDate(campaign.launchDate)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Budget {compactCurrency(campaign.totalBudget)}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
          No upcoming campaigns in planning right now.
        </div>
      )}
    </section>
  )
}
