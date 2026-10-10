"use client"

import { useState } from "react"
import Link from "next/link"
import { format, isValid, parseISO } from "date-fns"

import AdminDateRangeSelector from "@/app/dashboard/[slug]/[mba_number]/components/AdminDateRangeSelector"
import { ArchTrio } from "@/components/brand/ArchTrio"
import { ClientMark } from "@/components/brand/EntityMark"
import { HeroBand, heroBandSecondaryClassName } from "@/components/brand/HeroBand"
import { JourneyLine } from "@/components/brand/JourneyLine"
import { AVA_SKILL_MESSAGES } from "@/components/ava/AvaSkillActionSets"
import { CampaignStatusBadge } from "@/components/campaign/CampaignStatusBadge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/use-toast"
import { useAuthContext } from "@/contexts/AuthContext"
import { openAvaChat } from "@/lib/assistantBridge"
import { downloadStoredPlanFile } from "@/lib/docs/downloadStoredPlanFile"
import { formatMoney } from "@/lib/format/money"
import { resolveCampaignPhase } from "@/lib/mediaplan/campaignPhase"
import { cn } from "@/lib/utils"

interface CampaignHeroBannerProps {
  campaign: {
    campaignName: string
    clientName: string
    brand?: string
    mbaNumber: string
    status: string
    startDate: string
    endDate: string
    budget: number
    planVersion?: string | number
    publishedAt?: string
    creativeLine?: string
    poNumber?: string
    clientContact?: string
  }
  /** Client colour paints only ClientMark. */
  brandColour?: string
  daysRemaining: number
  onOpenDetails: () => void
  onDownload: () => void
  campaignStart?: string
  campaignEnd?: string
  onAskRead?: () => void
  versionId?: number | null
  canEdit?: boolean
}

function parseCampaignDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return isValid(date) ? date : null
  }
  const iso = parseISO(value)
  if (isValid(iso)) return iso
  const fallback = new Date(value)
  return isValid(fallback) ? fallback : null
}

function formatHeroRange(startDate: string, endDate: string): string {
  const start = parseCampaignDate(startDate)
  const end = parseCampaignDate(endDate)
  if (!start || !end) return "Date range unavailable"
  return `${format(start, "d MMM")} to ${format(end, "d MMM yyyy")}`
}

function formatPublished(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const date = parseCampaignDate(value)
  if (!date) return null
  return format(date, "d MMM")
}

export default function CampaignHeroBanner({
  campaign,
  brandColour,
  onOpenDetails,
  onDownload,
  campaignStart,
  campaignEnd,
  onAskRead,
  versionId = null,
  canEdit = false,
}: CampaignHeroBannerProps) {
  const { isAdmin } = useAuthContext()
  const [downloadingMba, setDownloadingMba] = useState(false)
  const budget = Number(campaign.budget ?? 0) || 0
  const phase = resolveCampaignPhase({
    status: campaign.status,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
  }).phase
  const creativeLine = campaign.creativeLine?.trim() || ""
  const published = formatPublished(campaign.publishedAt)
  const versionLabel =
    campaign.planVersion == null || campaign.planVersion === ""
      ? null
      : String(campaign.planVersion)
  const editHref = `/mediaplans/mba/${encodeURIComponent(campaign.mbaNumber)}/edit${
    versionLabel ? `?version=${encodeURIComponent(versionLabel)}` : ""
  }`

  const downloadMba = async () => {
    if (versionId == null) {
      toast({
        title: "Error",
        description: "MBA file not found for this version yet.",
        variant: "destructive",
      })
      return
    }
    setDownloadingMba(true)
    try {
      const { blob, fileName } = await downloadStoredPlanFile({
        versionId,
        kind: "mba_pdf",
      })
      const objectUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      window.URL.revokeObjectURL(objectUrl)
      document.body.removeChild(anchor)
      toast({ title: "Success", description: "MBA downloaded successfully" })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to download MBA",
        variant: "destructive",
      })
    } finally {
      setDownloadingMba(false)
    }
  }

  return (
    <HeroBand
      as="h1"
      punctuate={false}
      title={campaign.campaignName}
      accent={creativeLine || undefined}
      chips={
        <>
          <span className="inline-flex items-center gap-2 rounded-pill border border-am-muted-on-black/40 px-2.5 py-1 text-sm text-am-white">
            <ClientMark name={campaign.clientName} colour={brandColour} size="sm" />
            {campaign.clientName}
          </span>
          <CampaignStatusBadge
            status={campaign.status}
            startDate={campaign.startDate}
            endDate={campaign.endDate}
          />
        </>
      }
      meta={
        <p>
          MBA <b>{campaign.mbaNumber}</b>
          {" · "}
          {formatHeroRange(campaign.startDate, campaign.endDate)}
          {" · "}
          Budget <b>{formatMoney(budget, { decimals: 0 })}</b> ex GST
          {versionLabel ? (
            <>
              {" · "}
              Version <b>{versionLabel}</b>
              {published ? `, published ${published}` : null}
            </>
          ) : null}
        </p>
      }
      journey={<JourneyLine status={phase} />}
      arches={<ArchTrio />}
      actions={
        <>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(heroBandSecondaryClassName, "h-9 rounded-pill")}
              asChild
            >
              <Link href={editHref}>Edit plan</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-pill"
            disabled={downloadingMba}
            onClick={() => void downloadMba()}
          >
            Download MBA
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(heroBandSecondaryClassName, "h-9 rounded-pill")}
              >
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[12rem]"
              onInteractOutside={(event) => {
                const target = event.target
                if (target instanceof Element && target.closest("[data-radix-popper-content-wrapper]")) {
                  event.preventDefault()
                }
              }}
            >
              <div className="px-1 py-1">
                <AdminDateRangeSelector
                  campaignStart={campaignStart}
                  campaignEnd={campaignEnd}
                  variant="minimal"
                  showPresets
                />
              </div>
              <DropdownMenuItem onSelect={onOpenDetails}>View details</DropdownMenuItem>
              <DropdownMenuItem onSelect={onDownload}>Downloads</DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem onSelect={() => onAskRead?.()}>
                  Get AVA&apos;s read
                </DropdownMenuItem>
              ) : null}
              {isAdmin ? (
                <DropdownMenuItem
                  onSelect={() => openAvaChat({ message: AVA_SKILL_MESSAGES.planScenario })}
                >
                  Plan a scenario
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  )
}
