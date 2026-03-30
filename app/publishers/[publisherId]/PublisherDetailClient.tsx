"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BarChart3, FileText } from "lucide-react"
import { PageHeroShell } from "@/components/dashboard/PageHeroShell"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PublisherDetailCharts } from "./PublisherDetailCharts"
import { PublisherDetailsSlideOver } from "./PublisherDetailsSlideOver"
import { PublisherKpiSlideOver } from "./PublisherKpiSlideOver"
import { normalizePublisherRecord } from "@/lib/publisher/normalizePublisher"
import { publisherApiRecordPath, publisherHubPath } from "@/lib/publisher/publisherHubPath"
import type { Publisher, PublisherDashboardData } from "@/lib/types/publisher"
import { cn, hexToRgba } from "@/lib/utils"

function isSixDigitHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s)
}

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

  const rawPublisherColour = publisher.publisher_colour?.trim() ?? ""
  const heroHexAccent = rawPublisherColour && isSixDigitHex(rawPublisherColour) ? rawPublisherColour : null
  const brandColour = heroHexAccent ?? "#4f8fcb"

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-6 pb-12 sm:px-6 lg:px-8 lg:py-8 xl:px-12 2xl:px-16">
      <PageHeroShell brandColour={brandColour}>
        <div className="relative z-10 pt-6 pr-6 pb-6 pl-14 md:pt-8 md:pr-8 md:pb-8 md:pl-14 lg:pt-8 lg:pr-8 lg:pb-8 lg:pl-14 xl:pt-10 xl:pr-10 xl:pb-10 xl:pl-14">
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-4 h-auto p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground">
            <Link href="/publishers">← Back to publishers</Link>
          </Button>
          <div
            className={cn(
              "flex w-full flex-col gap-6 md:flex-row md:items-center md:gap-8 xl:gap-10",
              "pr-14 sm:pr-16 md:pr-20"
            )}
          >
            <div className="relative flex items-center gap-4">
              <div
                className="absolute -inset-2 rounded-full opacity-20 blur-xl"
                style={{ backgroundColor: brandColour }}
                aria-hidden
              />
              <div className="relative h-16 w-16 shrink-0">
                <div
                  className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 shadow-lg"
                  style={{ borderColor: hexToRgba(brandColour, 0.3) }}
                >
                  <span
                    className="flex h-full w-full items-center justify-center text-lg font-semibold text-white"
                    style={{ backgroundColor: brandColour }}
                    aria-label={`${publisher.publisher_name} initials`}
                  >
                    {publisherInitials(publisher.publisher_name || "")}
                  </span>
                </div>
                <span
                  className="absolute bottom-px right-px h-[10px] w-[10px] rounded-full bg-[#C5D82D] shadow-[0_0_0_2px_rgb(255,255,255)]"
                  aria-hidden
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2 xl:max-w-none">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl xl:text-4xl">
                {publisher.publisher_name}
              </h1>
              <p className="text-sm text-muted-foreground md:text-base">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: brandColour }} aria-hidden />
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
            </div>
          </div>
        </div>

        <div className="absolute right-3 top-1/2 z-20 -translate-y-1/2 sm:right-4 md:right-6 lg:right-8 xl:right-10">
          <TooltipProvider delayDuration={100}>
            <div className="flex flex-col gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(true)}
                    aria-label="Publisher details"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
        brandColour={publisher.publisher_colour?.trim() || undefined}
        publisherId={publisher.id}
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
