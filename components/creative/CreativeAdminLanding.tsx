"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Camera,
  ImagePlus,
  Search,
  type LucideIcon,
} from "lucide-react"

import { AvaCreativeSkillActions } from "@/components/ava/AvaSkillActionSets"
import { CreativeCampaignPicker } from "@/components/creative/CreativeCampaignPicker"
import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import { SlideOver } from "@/components/ui/SlideOver"
import { useToast } from "@/components/ui/use-toast"
import { openAvaChat } from "@/lib/assistantBridge"
import { getClientDisplayName } from "@/lib/clients/slug"
import type { TeamMember } from "@/lib/codex/types"
import { cn } from "@/lib/utils"

type ClientRow = {
  id?: number
  mp_client_name?: string
  client_name?: string
  clientname_input?: string
  name?: string
}

type MediaPlanRow = {
  mba_number?: string
  mp_client_name?: string
  mp_campaignname?: string
  campaign_name?: string
}

type TileId = "search" | "upload" | "screenshots"

type ProcessTile = {
  id: TileId
  title: string
  summary: string
  icon: LucideIcon
  /** Left accent — channel tokens where the tile maps to a media type. */
  accentBar: string
  accentBorder: string
  iconChip: string
}

const TILES: ProcessTile[] = [
  {
    id: "search",
    title: "Create search ads",
    summary:
      "Guided handoff into Ask Ava for RSA headlines and descriptions for a client campaign.",
    icon: Search,
    accentBar: "bg-channel-search",
    accentBorder: "border-l-channel-search",
    iconChip: "bg-pacing-ahead-bg text-status-ahead-fg",
  },
  {
    id: "upload",
    title: "Upload creative",
    summary:
      "Pick a client and campaign, then upload or manage assets in the existing creative flow.",
    icon: ImagePlus,
    accentBar: "bg-channel-social",
    accentBorder: "border-l-channel-social",
    iconChip: "bg-channel-social-bg text-channel-social-fg",
  },
  {
    id: "screenshots",
    title: "Create screenshots",
    summary:
      "Request live/creative screenshots as a Codex task for the selected client and campaign.",
    icon: Camera,
    accentBar: "bg-channel-bvod",
    accentBorder: "border-l-channel-bvod",
    iconChip: "bg-channel-bvod-bg text-channel-bvod",
  },
]

function normalizeClientName(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase()
}

function campaignLabel(plan: MediaPlanRow): string {
  return String(plan.mp_campaignname || plan.campaign_name || "Untitled campaign").trim()
}

function buildSearchAdPrompt(clientName: string, campaignName: string, mba: string): string {
  const client = clientName.trim() || "the selected client"
  const campaign = campaignName.trim() || "the selected campaign"
  const mbaBit = mba.trim() ? ` (MBA ${mba.trim()})` : ""
  return [
    `Draft search ad copy (RSA headlines and descriptions) for ${client} / ${campaign}${mbaBit}.`,
    "Follow Assembled search-ad craft; ask for keywords or offer angles if anything material is missing.",
  ].join(" ")
}

function buildScreenshotsTitle(clientName: string, campaignName: string): string {
  const client = clientName.trim() || "client"
  const campaign = campaignName.trim() || "campaign"
  return `Screenshots requested: ${client}/${campaign}`
}

type CreativeAdminLandingProps = {
  /** Server-read `CODEX_V2` flag — when false, T3 ships process copy only. */
  codexEnabled: boolean
}

export function CreativeAdminLanding({ codexEnabled }: CreativeAdminLandingProps) {
  const { toast } = useToast()
  const [panel, setPanel] = useState<TileId | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const [clients, setClients] = useState<ClientRow[]>([])
  const [plans, setPlans] = useState<MediaPlanRow[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [cascadeLoading, setCascadeLoading] = useState(true)

  const [clientName, setClientName] = useState("")
  const [mbaNumber, setMbaNumber] = useState("")
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setCascadeLoading(true)
      try {
        const fetches: Promise<Response>[] = [
          fetch("/api/clients"),
          fetch("/api/mediaplans"),
        ]
        if (codexEnabled) {
          fetches.push(fetch("/api/codex/team?active=0&per_page=100"))
        }
        const [clientsRes, plansRes, teamRes] = await Promise.all(fetches)
        if (cancelled) return

        if (clientsRes.ok) {
          const data = (await clientsRes.json()) as unknown
          setClients(Array.isArray(data) ? (data as ClientRow[]) : [])
        } else {
          setClients([])
        }

        if (plansRes.ok) {
          const data = (await plansRes.json()) as unknown
          setPlans(Array.isArray(data) ? (data as MediaPlanRow[]) : [])
        } else {
          setPlans([])
        }

        if (codexEnabled && teamRes?.ok) {
          const data = (await teamRes.json()) as unknown
          const list =
            data &&
            typeof data === "object" &&
            Array.isArray((data as { items?: unknown }).items)
              ? (data as { items: TeamMember[] }).items
              : Array.isArray(data)
                ? (data as TeamMember[])
                : []
          setTeamMembers(list)
        } else {
          setTeamMembers([])
        }
      } catch {
        if (!cancelled) {
          setClients([])
          setPlans([])
          setTeamMembers([])
        }
      } finally {
        if (!cancelled) setCascadeLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [codexEnabled])

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
      .filter(
        (plan) =>
          normalizeClientName(plan.mp_client_name) === selected &&
          Boolean(plan.mba_number)
      )
      .map((plan) => ({
        value: String(plan.mba_number),
        label: campaignLabel(plan),
        mba: String(plan.mba_number),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [clientName, plans])

  const selectedCampaignLabel = useMemo(() => {
    const hit = clientCampaigns.find((c) => c.value === mbaNumber)
    return hit?.label ?? ""
  }, [clientCampaigns, mbaNumber])

  const selectedClientId = useMemo(() => {
    if (!clientName) return 0
    const selected = normalizeClientName(clientName)
    const row = clients.find(
      (c) => normalizeClientName(getClientDisplayName(c)) === selected
    )
    const id = Number(row?.id)
    return Number.isFinite(id) && id > 0 ? id : 0
  }, [clientName, clients])

  const taskClients = useMemo(
    () =>
      clients
        .filter((c) => typeof c.id === "number" && Number.isFinite(c.id) && c.id > 0)
        .map((c) => ({
          id: Number(c.id),
          mp_client_name: c.mp_client_name,
          client_name: c.client_name,
        })),
    [clients]
  )

  const createPrefill = useMemo(
    () => ({
      title: buildScreenshotsTitle(clientName, selectedCampaignLabel),
      client_id: selectedClientId || undefined,
      mba_number: mbaNumber || undefined,
      category: "creative" as const,
      description: [
        "Screenshot request from Creative landing.",
        clientName ? `Client: ${clientName}` : null,
        selectedCampaignLabel
          ? `Campaign: ${selectedCampaignLabel}`
          : null,
        mbaNumber ? `MBA: ${mbaNumber}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    }),
    [clientName, mbaNumber, selectedCampaignLabel, selectedClientId]
  )

  const openTile = (id: TileId) => {
    if (id === "upload") {
      setShowUpload(true)
      setPanel(null)
      return
    }
    setPanel(id)
  }

  const handleAskAva = () => {
    if (!clientName.trim() || !mbaNumber.trim()) {
      toast({
        title: "Select client and campaign",
        description: "Ask Ava needs a client and campaign before drafting search ads.",
        variant: "destructive",
      })
      return
    }
    openAvaChat({
      message: buildSearchAdPrompt(clientName, selectedCampaignLabel, mbaNumber),
    })
    setPanel(null)
  }

  const handleOpenCodexTask = () => {
    if (!codexEnabled) return
    if (!selectedClientId || !mbaNumber.trim()) {
      toast({
        title: "Select client and campaign",
        description: "Codex needs a client and campaign to pre-fill the screenshot task.",
        variant: "destructive",
      })
      return
    }
    setTaskDialogOpen(true)
  }

  const cascadeFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="creative-landing-client">Client</Label>
        <Combobox
          id="creative-landing-client"
          options={clientOptions}
          value={clientName}
          onValueChange={(next) => {
            setClientName(next)
            setMbaNumber("")
          }}
          placeholder={cascadeLoading ? "Loading clients…" : "Select a client"}
          searchPlaceholder="Search clients…"
          emptyText="No clients found."
          disabled={cascadeLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="creative-landing-campaign">Campaign</Label>
        <Combobox
          id="creative-landing-campaign"
          options={clientCampaigns.map(({ value, label }) => ({ value, label }))}
          value={mbaNumber}
          onValueChange={setMbaNumber}
          placeholder={
            !clientName
              ? "Select a client first"
              : cascadeLoading
                ? "Loading campaigns…"
                : "Select a campaign"
          }
          searchPlaceholder="Search campaigns…"
          emptyText="No campaigns for this client."
          disabled={!clientName || cascadeLoading}
        />
      </div>
    </div>
  )

  return (
    <div
      className="w-full min-h-screen"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 pb-24 pt-0 sm:px-5 md:px-6 xl:px-8 2xl:px-10">
        <MediaPlanEditorHero
          className="mb-2 pt-6 md:pt-8"
          title="Creative"
          detail={
            <p className="text-sm text-muted-foreground">
              Start with the process you need — search ads, asset upload, or screenshot
              requests. Full filter-first asset management stays available inside Upload
              creative.
            </p>
          }
          actions={
            showUpload ? (
              <AvaCreativeSkillActions disabledReason="Select a campaign and a creative asset first" />
            ) : null
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((tile) => {
            const Icon = tile.icon
            const active =
              (tile.id === "upload" && showUpload) || panel === tile.id
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => openTile(tile.id)}
                className={cn(
                  "interactive group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card text-left shadow-e1",
                  "border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tile.accentBorder,
                  active && "shadow-e2 ring-1 ring-ring/40"
                )}
              >
                <div className={cn("h-[3px] w-full", tile.accentBar)} aria-hidden />
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <span
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-input",
                      tile.iconChip
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-foreground">
                      {tile.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">{tile.summary}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {showUpload ? (
          <section
            id="creative-upload-flow"
            className="space-y-4 rounded-card border border-border bg-card p-4 shadow-e1 sm:p-6"
            aria-label="Upload creative"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">
                  Upload creative
                </h2>
                <p className="text-sm text-muted-foreground">
                  Existing campaign picker, asset table, filters, and upload zone —
                  unchanged, re-entered from this landing.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowUpload(false)}
              >
                Hide upload flow
              </Button>
            </div>
            <CreativeCampaignPicker />
          </section>
        ) : null}
      </div>

      <SlideOver
        open={panel === "search"}
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
        title="Create search ads"
        description="Process handoff into Ask Ava — not a standalone search-ad builder."
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Select the client and campaign this copy is for.</li>
            <li>Open Ask Ava with a pre-filled search-ad drafting prompt.</li>
            <li>
              Refine RSA headlines and descriptions in chat; use Upload creative when
              you have assets to attach.
            </li>
          </ol>
          {cascadeFields}
          <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-5">
            <Button type="button" onClick={handleAskAva}>
              Open Ask Ava
            </Button>
            <Button type="button" variant="outline" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver
        open={panel === "screenshots"}
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
        title="Create screenshots"
        description="Process handoff into a Codex creative task — not an in-app capture tool."
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Select the client and campaign that need screenshots.</li>
            <li>
              Create a Codex task titled{" "}
              <span className="font-medium text-foreground">
                Screenshots requested: {"{client/campaign}"}
              </span>
              .
            </li>
            <li>
              Assignees complete capture via the existing creative / mockup tooling;
              track status on Tasks.
            </li>
          </ol>
          {cascadeFields}
          <div className="mt-auto space-y-3 border-t border-border pt-5">
            {codexEnabled ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleOpenCodexTask}>
                  Create Codex task
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPanel(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Codex task create is unavailable in this environment (flag off). Use
                this process description and create the task from Tasks when Codex is
                enabled — no pretend action on this tile.
              </p>
            )}
          </div>
        </div>
      </SlideOver>

      {codexEnabled ? (
        <TaskFormDialog
          open={taskDialogOpen}
          onOpenChange={setTaskDialogOpen}
          task={null}
          clients={taskClients}
          teamMembers={teamMembers}
          createPrefill={createPrefill}
          onSaved={() => {
            toast({
              title: "Screenshot task created",
              description: "Open Tasks to track or assign the request.",
            })
            setPanel(null)
          }}
        />
      ) : null}
    </div>
  )
}
