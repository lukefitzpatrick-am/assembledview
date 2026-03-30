"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PacingStatusBadge } from "@/components/dashboard/PacingStatusBadge"
import { Separator } from "@/components/ui/separator"
import { getMediaChannelBadgeStyle } from "@/lib/media/channelColors"
import { cn } from "@/lib/utils"
import { CalendarDays, ChevronDown, Download, FileText, Share2 } from "lucide-react"

type CampaignInfoHeaderProps = {
  campaign: any
  className?: string
}

function parseCurrency(value: any, currency = "AUD") {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^0-9.-]+/g, "")) || 0
        : 0
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num)
}

function formatDate(value: any) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d)
}

function InfoChip({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-foreground ring-1 ring-muted">
      <span className="text-muted-foreground">{label}</span>
      <Separator orientation="vertical" className="h-4" />
      <span className="leading-none">{value}</span>
    </span>
  )
}

const mediaTypeLabels: Record<string, string> = {
  mp_television: "Television",
  mp_radio: "Radio",
  mp_newspaper: "Newspaper",
  mp_magazines: "Magazines",
  mp_ooh: "OOH",
  mp_cinema: "Cinema",
  mp_digidisplay: "Digital Display",
  mp_digiaudio: "Digital Audio",
  mp_digivideo: "Digital Video",
  mp_bvod: "BVOD",
  mp_integration: "Integration",
  mp_search: "Search",
  mp_socialmedia: "Social Media",
  mp_progdisplay: "Programmatic Display",
  mp_progvideo: "Programmatic Video",
  mp_progbvod: "Programmatic BVOD",
  mp_progaudio: "Programmatic Audio",
  mp_progooh: "Programmatic OOH",
  mp_influencers: "Influencers",
  mp_production: "Production",
}

function isTruthyFlag(value: any) {
  if (value === undefined || value === null) return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["yes", "true", "1", "y"].includes(normalized)
  }
  return false
}

function resolveClientName(campaign: any): string {
  const client = campaign?.client
  if (client && typeof client === "object") {
    return (
      client.name ||
      client.client_name ||
      client.clientName ||
      client.client_name_display ||
      client.mp_client_name ||
      client.mpClientName ||
      ""
    )
  }
  return (
    client ||
    campaign?.client_name ||
    campaign?.mp_client_name ||
    campaign?.clientName ||
    campaign?.client_name_display ||
    ""
  )
}

export default function CampaignInfoHeader({ campaign, className }: CampaignInfoHeaderProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const [activeCategory, setActiveCategory] = useState<"all" | "traditional" | "digital" | "programmatic">("all")

  const name =
    campaign?.campaign_name ||
    campaign?.mp_campaignname ||
    campaign?.campaignName ||
    campaign?.name ||
    "Campaign"

  const brand = campaign?.campaign_brand || campaign?.brand || campaign?.mp_brand || ""
  const mba =
    campaign?.mbaNumber || campaign?.mba_number || campaign?.mp_mbanumber || campaign?.mp_mba_number || ""
  const client = resolveClientName(campaign)

  const status = campaign?.status || campaign?.campaign_status || campaign?.mp_campaign_status || "Active"
  const budget =
    campaign?.campaign_budget ||
    campaign?.mp_campaignbudget ||
    campaign?.total_budget ||
    campaign?.total_media ||
    campaign?.totalMedia ||
    0

  const planVersion =
    campaign?.versionNumber || campaign?.version_number || campaign?.media_plan_version || campaign?.mp_plannumber
  const planDate = campaign?.plan_date || campaign?.created_at || campaign?.date || campaign?.updated_at
  const poNumber = campaign?.po_number || campaign?.poNumber || campaign?.purchase_order_number
  const contact = campaign?.client_contact || campaign?.contact_name || campaign?.contactName
  const pacingPct =
    Number(
      campaign?.pacingPct ??
        campaign?.pacing_pct ??
        campaign?.pacing_percentage ??
        campaign?.pacing ??
        0
    ) || 0
  const spendToDate =
    Number(
      campaign?.spend_to_date ??
        campaign?.spendToDate ??
        campaign?.actual_spend ??
        campaign?.actualSpend ??
        0
    ) || 0

  const mediaTypes = Object.entries(mediaTypeLabels)
    .filter(([key]) => isTruthyFlag((campaign as any)?.[key]))
    .map(([key, label]) => ({ key: key.replace(/^mp_/, ""), label }))

  const groupedMediaTypes = useMemo(() => {
    const traditional = mediaTypes.filter((m) =>
      ["television", "radio", "newspaper", "magazines", "ooh", "cinema"].includes(m.key)
    )
    const programmatic = mediaTypes.filter((m) => m.key.startsWith("prog"))
    const digital = mediaTypes.filter(
      (m) => !traditional.some((t) => t.key === m.key) && !programmatic.some((p) => p.key === m.key)
    )
    return { traditional, digital, programmatic }
  }, [mediaTypes])

  const flatFilteredMedia =
    activeCategory === "all"
      ? mediaTypes
      : groupedMediaTypes[
          activeCategory as Exclude<typeof activeCategory, "all">
        ]

  const startDate = new Date(campaign?.startDate || campaign?.campaign_start_date || campaign?.start_date)
  const endDate = new Date(campaign?.endDate || campaign?.campaign_end_date || campaign?.end_date)
  const now = new Date()
  const totalDays =
    !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())
      ? Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      : null
  const elapsedDays =
    totalDays && !Number.isNaN(startDate.getTime())
      ? Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1))
      : null
  const daysRemaining =
    !Number.isNaN(endDate.getTime())
      ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null

  const downloadUrl =
    campaign?.download_url || campaign?.media_plan_download_url || campaign?.mediaPlanDownloadUrl || null

  return (
    <div className={cn("relative", className)}>
      <div className="pb-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href={`/dashboard/${encodeURIComponent(campaign?.slug || campaign?.client_slug || "")}`}
            className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {client || "Client"}
          </Link>
          <span>/</span>
          <span className="truncate text-foreground">{name}</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-[28px] font-semibold leading-tight tracking-tight md:text-[32px]">{name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground md:text-base">
              {brand ? <span className="font-medium text-foreground">{brand}</span> : null}
              {brand && mba ? <span className="text-muted-foreground/60">•</span> : null}
              {mba ? (
                <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] md:text-[12px]">
                  {mba}
                </Badge>
              ) : null}
              {(brand || mba) && client ? <span className="text-muted-foreground/60">•</span> : null}
              {client ? (
                <span className="font-medium text-foreground">{client}</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-primary/15 px-4 py-2 text-[14px] font-semibold text-primary md:text-[16px]">
              {parseCurrency(budget)}
            </Badge>
            <div className="transition-all duration-300 animate-in fade-in-0">
              <PacingStatusBadge pacingPct={pacingPct} size="md" showIcon showLabel className="capitalize" />
            </div>
            <Badge variant="secondary" className="rounded-full px-4 py-2 text-[14px] font-semibold capitalize md:text-[16px]">
              {status}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                if (downloadUrl) window.open(downloadUrl, "_blank", "noopener,noreferrer")
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Media Plan
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => window.print()}
            >
              <FileText className="mr-2 h-4 w-4" />
              Export Report
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="focus-visible:ring-2 focus-visible:ring-ring"
              onClick={async () => {
                await navigator.clipboard.writeText(window.location.href)
              }}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share Dashboard
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3 sm:text-sm">
          <div className="rounded-md bg-background/70 px-3 py-2">
            <p className="text-muted-foreground">Days elapsed</p>
            <p className="font-semibold text-foreground">
              {elapsedDays ?? "—"} / {totalDays ?? "—"}
            </p>
          </div>
          <div className="rounded-md bg-background/70 px-3 py-2">
            <p className="text-muted-foreground">Budget spent</p>
            <p className="font-semibold text-foreground">
              {parseCurrency(spendToDate)} / {parseCurrency(budget)}
            </p>
          </div>
          <div className="rounded-md bg-background/70 px-3 py-2">
            <p className="text-muted-foreground">Pacing</p>
            <div className="mt-1 inline-flex items-center gap-2">
              <PacingStatusBadge pacingPct={pacingPct} size="sm" />
              <span className="text-foreground">{daysRemaining ?? "—"}d left</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 pt-4">
        <div className="hidden flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-sm md:flex md:text-base">
          <InfoChip label="Client Contact" value={contact} />
          <InfoChip label="Plan Version" value={planVersion} />
          <InfoChip label="Plan Date" value={formatDate(planDate)} />
          <InfoChip label="PO Number" value={poNumber} />
        </div>
        <div className="md:hidden">
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => setMobileExpanded((prev) => !prev)}
            aria-expanded={mobileExpanded}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            {mobileExpanded ? "Hide details" : "Show details"}
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", mobileExpanded && "rotate-180")} />
          </Button>
          {mobileExpanded ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-sm">
              <InfoChip label="Client Contact" value={contact} />
              <InfoChip label="Plan Version" value={planVersion} />
              <InfoChip label="Plan Date" value={formatDate(planDate)} />
              <InfoChip label="PO Number" value={poNumber} />
            </div>
          ) : null}
        </div>
      </div>

      {mediaTypes.length ? (
        <div className="mt-4 border-t border-border/60 pt-4">
          <div className="mb-2 flex items-center gap-2">
            <Button type="button" variant={activeCategory === "all" ? "secondary" : "outline"} size="sm" onClick={() => setActiveCategory("all")}>
              All
            </Button>
            <Button type="button" variant={activeCategory === "traditional" ? "secondary" : "outline"} size="sm" onClick={() => setActiveCategory("traditional")}>
              Traditional
            </Button>
            <Button type="button" variant={activeCategory === "digital" ? "secondary" : "outline"} size="sm" onClick={() => setActiveCategory("digital")}>
              Digital
            </Button>
            <Button type="button" variant={activeCategory === "programmatic" ? "secondary" : "outline"} size="sm" onClick={() => setActiveCategory("programmatic")}>
              Programmatic
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {flatFilteredMedia.slice(0, 5).map(({ key, label }) => (
              <Badge
                key={key}
                variant="secondary"
                className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold cursor-pointer focus-visible:ring-2 focus-visible:ring-ring")}
                style={getMediaChannelBadgeStyle(key)}
              >
                {label}
              </Badge>
            ))}
            {flatFilteredMedia.length > 5 ? (
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                +{flatFilteredMedia.length - 5} more
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
