"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"

import { CreativeAssetManager } from "@/components/creative/CreativeAssetManager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getClientDisplayName } from "@/lib/clients/slug"
import { cn } from "@/lib/utils"

type ClientRow = {
  id?: number
  mp_client_name?: string
  client_name?: string
  clientname_input?: string
  name?: string
  idmeta?: string | number | null
}

type MediaPlanRow = {
  mba_number?: string
  mp_client_name?: string
  mp_campaignname?: string
  campaign_name?: string
  campaign_status?: string
  campaign_start_date?: string
}

type CreativeCampaignPickerProps = {
  /**
   * When set, freezes the client Combobox to this client name and preselects it.
   * Reserved for a future client-role surface — unused by the staff `/creative` page.
   */
  lockedClientName?: string
}

const PRIORITY_STATUSES = new Set(["live", "booked", "approved"])

function normalizeClientName(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase()
}

function campaignLabel(plan: MediaPlanRow): string {
  return String(plan.mp_campaignname || plan.campaign_name || "Untitled campaign").trim()
}

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

function sortCampaigns(a: MediaPlanRow, b: MediaPlanRow): number {
  const aPriority = PRIORITY_STATUSES.has(String(a.campaign_status ?? "").toLowerCase()) ? 0 : 1
  const bPriority = PRIORITY_STATUSES.has(String(b.campaign_status ?? "").toLowerCase()) ? 0 : 1
  if (aPriority !== bPriority) return aPriority - bPriority
  return startDateMs(b.campaign_start_date) - startDateMs(a.campaign_start_date)
}

export function CreativeCampaignPicker({ lockedClientName }: CreativeCampaignPickerProps) {
  const clientLocked = Boolean(lockedClientName?.trim())
  const [clientName, setClientName] = useState(() => lockedClientName?.trim() ?? "")
  const [mbaNumber, setMbaNumber] = useState("")
  const [campaignOpen, setCampaignOpen] = useState(false)

  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState<string | null>(null)

  const [plans, setPlans] = useState<MediaPlanRow[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [plansError, setPlansError] = useState<string | null>(null)

  useEffect(() => {
    if (!lockedClientName?.trim()) return
    setClientName(lockedClientName.trim())
  }, [lockedClientName])

  useEffect(() => {
    let cancelled = false

    async function loadClients() {
      setClientsLoading(true)
      setClientsError(null)
      try {
        const response = await fetch("/api/clients")
        if (!response.ok) {
          throw new Error("Failed to load clients")
        }
        const data = (await response.json()) as unknown
        if (cancelled) return
        setClients(Array.isArray(data) ? (data as ClientRow[]) : [])
      } catch (error) {
        if (cancelled) return
        setClients([])
        setClientsError(error instanceof Error ? error.message : "Failed to load clients")
      } finally {
        if (!cancelled) setClientsLoading(false)
      }
    }

    void loadClients()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadPlans() {
      setPlansLoading(true)
      setPlansError(null)
      try {
        const response = await fetch("/api/mediaplans")
        if (!response.ok) {
          throw new Error("Failed to load campaigns")
        }
        const data = (await response.json()) as unknown
        if (cancelled) return
        setPlans(Array.isArray(data) ? (data as MediaPlanRow[]) : [])
      } catch (error) {
        if (cancelled) return
        setPlans([])
        setPlansError(error instanceof Error ? error.message : "Failed to load campaigns")
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    }

    void loadPlans()
    return () => {
      cancelled = true
    }
  }, [])

  const clientOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: { value: string; label: string }[] = []
    for (const row of clients) {
      const label = getClientDisplayName(row)
      if (!label) continue
      const key = normalizeClientName(label)
      if (seen.has(key)) continue
      seen.add(key)
      options.push({ value: label, label })
    }
    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [clients])

  const clientCampaigns = useMemo(() => {
    if (!clientName) return []
    const selected = normalizeClientName(clientName)
    return plans
      .filter((plan) => normalizeClientName(plan.mp_client_name) === selected && Boolean(plan.mba_number))
      .slice()
      .sort(sortCampaigns)
  }, [clientName, plans])

  const selectedCampaign = useMemo(
    () => clientCampaigns.find((plan) => plan.mba_number === mbaNumber) ?? null,
    [clientCampaigns, mbaNumber],
  )

  const selectedClientMetaPageId = useMemo(() => {
    if (!clientName) return ""
    const selected = normalizeClientName(clientName)
    const row = clients.find((client) => normalizeClientName(getClientDisplayName(client)) === selected)
    return String(row?.idmeta ?? "").trim()
  }, [clientName, clients])

  const handleClientChange = (next: string) => {
    setClientName(next)
    setMbaNumber("")
    setCampaignOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="creative-client">Client</Label>
          {clientsLoading ? (
            <div className="flex h-10 items-center gap-2 rounded-input border border-border px-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading clients…
            </div>
          ) : clientsError ? (
            <div className="rounded-card border border-destructive/40 bg-pacing-critical-bg px-3 py-2 text-sm text-status-critical-fg">
              {clientsError}
            </div>
          ) : (
            <Combobox
              id="creative-client"
              options={clientOptions}
              value={clientName}
              onValueChange={handleClientChange}
              placeholder="Select a client"
              searchPlaceholder="Search clients…"
              emptyText="No clients found."
              disabled={clientLocked}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="creative-campaign">Campaign</Label>
          <Popover open={campaignOpen} onOpenChange={setCampaignOpen}>
            <PopoverTrigger asChild>
              <Button
                id="creative-campaign"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={campaignOpen}
                className="w-full justify-between"
                disabled={!clientName || plansLoading || Boolean(plansError)}
              >
                {selectedCampaign ? (
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span className="truncate">
                      {campaignLabel(selectedCampaign)}
                      <span className="text-muted-foreground"> · {selectedCampaign.mba_number}</span>
                    </span>
                    {selectedCampaign.campaign_status ? (
                      <Badge className={cn("shrink-0", statusBadgeClassName(selectedCampaign.campaign_status))}>
                        {selectedCampaign.campaign_status}
                      </Badge>
                    ) : null}
                  </span>
                ) : (
                  <span className="truncate text-muted-foreground">
                    {!clientName
                      ? "Select a client first"
                      : plansLoading
                        ? "Loading campaigns…"
                        : "Select a campaign"}
                  </span>
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
                    {clientCampaigns.map((plan) => {
                      const mba = String(plan.mba_number)
                      const status = String(plan.campaign_status ?? "").trim()
                      const label = campaignLabel(plan)
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
                              <Badge className={cn("ml-auto shrink-0", statusBadgeClassName(status))}>{status}</Badge>
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
      </div>

      {plansError ? (
        <div className="rounded-card border border-destructive/40 bg-pacing-critical-bg px-4 py-3 text-sm text-status-critical-fg">
          Could not load campaigns. {plansError}
        </div>
      ) : null}

      {!clientName ? (
        <div className="rounded-card border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-e1">
          Select a client to see their campaigns.
        </div>
      ) : null}

      {clientName && !plansLoading && !plansError && clientCampaigns.length === 0 ? (
        <div className="rounded-card border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-e1">
          No campaigns found for {clientName}.
        </div>
      ) : null}

      {mbaNumber ? (
        <CreativeAssetManager
          key={mbaNumber}
          mbaNumber={mbaNumber}
          metaPageId={selectedClientMetaPageId}
        />
      ) : null}
    </div>
  )
}
