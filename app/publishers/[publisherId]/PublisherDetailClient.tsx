"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BarChart3, FileText } from "lucide-react"
import { PAGE_HERO_PADDING, PageHeroShell, PageHeroTitleBlock } from "@/components/dashboard/PageHeroShell"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PublisherDetailCharts } from "./PublisherDetailCharts"
import { PublisherDetailsSlideOver } from "./PublisherDetailsSlideOver"
import { PublisherKpiSlideOver } from "./PublisherKpiSlideOver"
import { normalizePublisherRecord } from "@/lib/publisher/normalizePublisher"
import { publisherApiRecordPath, publisherHubPath } from "@/lib/publisher/publisherHubPath"
import type { Publisher, PublisherDashboardData } from "@/lib/types/publisher"
import { cn } from "@/lib/utils"

const PUBLISHER_HERO_ACCENT = "var(--pacing-on-track)"

function publisherInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

interface PublisherDetailClientProps {
  initialPublisher: Publisher
  analytics: PublisherDashboardData
}

export function PublisherDetailClient({ initialPublisher, analytics }: PublisherDetailClientProps) {
  const router = useRouter()
  const [publisher, setPublisher] = useState(() => normalizePublisherRecord(initialPublisher))
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [kpisOpen, setKpisOpen] = useState(false)

  useEffect(() => {
    setPublisher(normalizePublisherRecord(initialPublisher))
  }, [initialPublisher])

  const refreshPublisher = useCallback(
    async (updatedFromPut?: Publisher) => {
      const pathSource = updatedFromPut ?? publisher
      const r = await fetch(publisherApiRecordPath(pathSource))
      if (r.ok) {
        const p = await r.json()
        setPublisher(normalizePublisherRecord(p))
      }
      if (
        updatedFromPut &&
        publisherHubPath(updatedFromPut) !== publisherHubPath(publisher)
      ) {
        router.replace(publisherHubPath(updatedFromPut))
      }
      router.refresh()
    },
    [publisher, router],
  )

  const brandColour = PUBLISHER_HERO_ACCENT

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-6 pb-12 sm:px-6 lg:px-8 lg:py-8 xl:px-12 2xl:px-16">
      <PageHeroShell brandColour={brandColour}>
        <div className={cn("relative z-10", PAGE_HERO_PADDING, "pr-14 sm:pr-16 md:pr-20")}>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-4 h-auto p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground">
            <Link href="/publishers">← Back to publishers</Link>
          </Button>
          <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-start sm:gap-5">
            <div className="relative h-14 w-14 shrink-0">
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-pill border border-border shadow-e1">
                <span
                  className="flex h-full w-full items-center justify-center bg-pacing-on-track text-base font-semibold text-primary-foreground"
                  aria-label={`${publisher.publisher_name} initials`}
                >
                  {publisherInitials(publisher.publisher_name || "")}
                </span>
              </div>
              <span
                className="absolute bottom-px right-px h-[10px] w-[10px] rounded-pill bg-accent shadow-e0 ring-2 ring-card"
                aria-hidden
              />
            </div>

            <PageHeroTitleBlock
              title={publisher.publisher_name}
              brandColour={brandColour}
              detail={
                <p>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-pill bg-pacing-on-track" aria-hidden />
                    {publisher.publisherid}
                  </span>
                  <span aria-hidden className="mx-2 text-border">
                    •
                  </span>
                  <span>{publisher.publishertype?.replace("_", " ")}</span>
                  <span aria-hidden className="mx-2 text-border">
                    •
                  </span>
                  <span>{publisher.billingagency}</span>
                  <span aria-hidden className="mx-2 text-border">
                    •
                  </span>
                  <span>Finance {publisher.financecode}</span>
                </p>
              }
            />
          </div>
        </div>

        <div className="absolute right-6 top-1/2 z-20 -translate-y-1/2 md:right-7">
          <TooltipProvider delayDuration={100}>
            <div className="flex flex-col gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(true)}
                    aria-label="Publisher details"
                    className="interactive flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-e0 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Publisher details</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setKpisOpen(true)}
                    aria-label="KPIs and targets"
                    className="interactive flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-e0 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">KPIs & targets</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </PageHeroShell>

      <PublisherDetailCharts
        analytics={analytics}
        brandColour={brandColour}
        publisherId={publisher.id}
        publisherName={publisher.publisher_name}
      />

      <PublisherDetailsSlideOver
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        publisher={publisher}
        onSuccess={refreshPublisher}
      />
      <PublisherKpiSlideOver
        open={kpisOpen}
        onOpenChange={setKpisOpen}
        publisher={publisher}
        onSuccess={refreshPublisher}
      />
    </div>
  )
}
