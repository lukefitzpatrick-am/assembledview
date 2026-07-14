"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { CreativeAssetManager } from "@/components/creative/CreativeAssetManager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ClientCampaignOption = {
  mbaNumber: string
  campaignName: string
  status?: string
  /** Used for sort only — most recent first within priority status group. */
  startDate?: string
}

type ClientCreativePickerProps = {
  campaigns: ClientCampaignOption[]
  /** Client's idmeta, resolved server-side; may be "". */
  metaPageId?: string
}

const PRIORITY_STATUSES = new Set(["live", "booked", "approved"])

function statusBadgeClassName(status: string): string {
  switch (status.toLowerCase()) {
    case "live":
    case "booked":
      return "bg-pacing-on-track-bg text-status-on-track-fg border-0"
    case "approved":
    case "completed":
      return "bg-pacing-ahead-bg text-status-ahead-fg border-0"
    case "planned":
      return "bg-pacing-on-track-bg text-status-on-track-fg border-0"
    case "cancelled":
      return "bg-pacing-critical-bg text-status-critical-fg border-0"
    case "draft":
    default:
      return "bg-surface-muted text-muted-foreground border-0"
  }
}

function startDateMs(value: string | undefined): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function sortCampaigns(a: ClientCampaignOption, b: ClientCampaignOption): number {
  const aPriority = PRIORITY_STATUSES.has(String(a.status ?? "").toLowerCase()) ? 0 : 1
  const bPriority = PRIORITY_STATUSES.has(String(b.status ?? "").toLowerCase()) ? 0 : 1
  if (aPriority !== bPriority) return aPriority - bPriority
  return startDateMs(b.startDate) - startDateMs(a.startDate)
}

function campaignOptionLabel(campaign: ClientCampaignOption): string {
  return String(campaign.campaignName || "Untitled campaign").trim()
}

export function ClientCreativePicker({
  campaigns,
  metaPageId = "",
}: ClientCreativePickerProps) {
  const [mbaNumber, setMbaNumber] = useState("")
  const [campaignOpen, setCampaignOpen] = useState(false)

  const sortedCampaigns = useMemo(
    () => campaigns.slice().sort(sortCampaigns),
    [campaigns],
  )

  const selectedCampaign = useMemo(
    () => sortedCampaigns.find((campaign) => campaign.mbaNumber === mbaNumber) ?? null,
    [sortedCampaigns, mbaNumber],
  )

  if (campaigns.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-e1">
        No campaigns available yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="max-w-xl space-y-2">
        <Label htmlFor="client-creative-campaign">Campaign</Label>
        <Popover open={campaignOpen} onOpenChange={setCampaignOpen}>
          <PopoverTrigger asChild>
            <Button
              id="client-creative-campaign"
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={campaignOpen}
              className="w-full justify-between"
            >
              {selectedCampaign ? (
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <span className="truncate">
                    {campaignOptionLabel(selectedCampaign)}
                    <span className="text-muted-foreground"> · {selectedCampaign.mbaNumber}</span>
                  </span>
                  {selectedCampaign.status ? (
                    <Badge className={cn("shrink-0", statusBadgeClassName(selectedCampaign.status))}>
                      {selectedCampaign.status}
                    </Badge>
                  ) : null}
                </span>
              ) : (
                <span className="truncate text-muted-foreground">Select a campaign</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search campaigns…" />
              <CommandList>
                <CommandEmpty>No campaigns found.</CommandEmpty>
                <CommandGroup>
                  {sortedCampaigns.map((campaign) => {
                    const mba = campaign.mbaNumber
                    const status = String(campaign.status ?? "").trim()
                    const label = campaignOptionLabel(campaign)
                    const isSelected = mba === mbaNumber
                    return (
                      <CommandItem
                        key={mba}
                        value={`${label} ${mba} ${status}`}
                        onSelect={() => {
                          setMbaNumber(mba)
                          setCampaignOpen(false)
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="min-w-0 truncate">
                            {label}
                            <span className="text-muted-foreground"> · {mba}</span>
                          </span>
                          {status ? (
                            <Badge className={cn("ml-auto shrink-0", statusBadgeClassName(status))}>
                              {status}
                            </Badge>
                          ) : null}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {mbaNumber ? (
        <CreativeAssetManager
          key={mbaNumber}
          mbaNumber={mbaNumber}
          clientMode
          metaPageId={metaPageId}
        />
      ) : null}
    </div>
  )
}
