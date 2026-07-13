"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronsUpDown, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { getClientDisplayName } from "@/lib/clients/slug"
import { cn } from "@/lib/utils"
import { PLANNING_CATEGORIES, OBJECTIVE_PRESETS, type ObjectiveKind } from "./constants"
import type { BriefState } from "./store"

type ClientRow = {
  id?: number
  mp_client_name?: string
  client_name?: string
  clientname_input?: string
  name?: string
}

type StageBriefProps = {
  brief: BriefState
  onPatch: (patch: Partial<BriefState>) => void
  onObjective: (kind: ObjectiveKind) => void
  onContinue: () => void
}

function parseYmd(value: string | null): Date | undefined {
  if (!value) return undefined
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function toYmd(date: Date | undefined): string | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function StageBrief({ brief, onPatch, onObjective, onContinue }: StageBriefProps) {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [clientOpen, setClientOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setClientsLoading(true)
      setClientsError(null)
      try {
        // Same source as CreativeCampaignPicker — GET /api/clients (no new API).
        const res = await fetch("/api/clients")
        if (!res.ok) throw new Error("Failed to load clients")
        const data = (await res.json()) as unknown
        if (cancelled) return
        setClients(Array.isArray(data) ? (data as ClientRow[]) : [])
      } catch (err) {
        if (cancelled) return
        setClients([])
        setClientsError(err instanceof Error ? err.message : "Failed to load clients")
      } finally {
        if (!cancelled) setClientsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const clientOptions = useMemo(() => {
    return clients
      .map((c) => ({
        id: typeof c.id === "number" ? c.id : null,
        name: getClientDisplayName(c),
      }))
      .filter((c) => c.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [clients])

  const canContinue = Boolean(
    brief.clientName.trim() &&
      brief.campaignName.trim() &&
      brief.startDate &&
      brief.endDate &&
      brief.budget > 0 &&
      brief.objectiveKind
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">Brief & objective</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Client, flight window, and the Create:Capture bias that drives BCS weights.
        </p>
      </div>

      <div className="rounded-card border border-border bg-card p-5 shadow-e1">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Client</Label>
            <Popover open={clientOpen} onOpenChange={setClientOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={clientOpen}
                  className="w-full justify-between font-normal"
                  disabled={clientsLoading}
                >
                  {clientsLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading clients…
                    </span>
                  ) : brief.clientName ? (
                    brief.clientName
                  ) : (
                    <span className="text-muted-foreground">Select client…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search clients…" />
                  <CommandList>
                    <CommandEmpty>No client found.</CommandEmpty>
                    <CommandGroup>
                      {clientOptions.map((c) => (
                        <CommandItem
                          key={`${c.id ?? c.name}`}
                          value={c.name}
                          onSelect={() => {
                            onPatch({ clientId: c.id, clientName: c.name })
                            setClientOpen(false)
                          }}
                        >
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {clientsError ? (
              <p className="text-xs text-status-critical-fg">{clientsError}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand-override">Brand override (optional)</Label>
            <Input
              id="brand-override"
              value={brief.brandOverride}
              onChange={(e) => onPatch({ brandOverride: e.target.value })}
              placeholder="Leave blank to use client name"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input
              id="campaign-name"
              value={brief.campaignName}
              onChange={(e) => onPatch({ campaignName: e.target.value })}
              placeholder="e.g. Spring trial push"
            />
          </div>

          <div className="space-y-2">
            <Label>Start date</Label>
            <DatePicker
              date={parseYmd(brief.startDate)}
              setDate={(d) => onPatch({ startDate: toYmd(d) })}
            />
          </div>

          <div className="space-y-2">
            <Label>End date</Label>
            <DatePicker
              date={parseYmd(brief.endDate)}
              setDate={(d) => onPatch({ endDate: toYmd(d) })}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={brief.category}
              onValueChange={(v) => onPatch({ category: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {PLANNING_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Market</Label>
            <div>
              <Badge variant="outline" size="sm" className="font-normal">
                {brief.market}
              </Badge>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                States are chosen per audience in Stage B.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget">Working budget (AUD)</Label>
            <Input
              id="budget"
              type="number"
              min={0}
              step={1000}
              value={brief.budget}
              onChange={(e) => onPatch({ budget: Number(e.target.value) || 0 })}
              className="num"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Objective</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(OBJECTIVE_PRESETS) as ObjectiveKind[]).map((kind) => {
            const preset = OBJECTIVE_PRESETS[kind]
            const active = brief.objectiveKind === kind
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onObjective(kind)}
                className={cn(
                  "interactive rounded-card border border-border bg-card p-4 text-left shadow-e0 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "border-primary bg-primary/5 shadow-e1"
                )}
              >
                <div className="text-sm font-medium">{preset.label}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{preset.blurb}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" disabled={!canContinue} onClick={onContinue}>
          Continue to audiences
        </Button>
      </div>
    </div>
  )
}
