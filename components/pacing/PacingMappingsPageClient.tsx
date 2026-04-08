"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Pencil } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { InlineEditActions } from "@/components/finance/InlineEditCell"
import { MappingEditor } from "@/components/pacing/MappingEditor"
import { allPlatformFilterOptions, labelForPlatform } from "@/lib/pacing/mappingFormConstants"
import {
  getAutoSyncNewMappingConfirmMessage,
  mediaTypeHasAutoSyncSource,
} from "@/lib/pacing/media-type-config"
import { validateSuffixIdLineItemCode } from "@/lib/pacing/suffixIdLineItemCode"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import {
  deletePacingMapping,
  fetchPacingMappings,
  updatePacingMapping,
} from "@/lib/xano/pacing-client"
import type { PacingMapping, PacingMatchType } from "@/lib/xano/pacing-types"
import { cn } from "@/lib/utils"

type ClientOpt = { value: string; label: string }

type RowDraft = Partial<
  Pick<
    PacingMapping,
    | "campaign_name_pattern"
    | "group_name_pattern"
    | "av_line_item_code"
    | "budget_split_pct"
    | "line_item_budget"
    | "start_date"
    | "end_date"
    | "is_active"
  >
>

function matchTypeLabel(m: PacingMatchType): string {
  if (m === "exact") return "Exact"
  if (m === "prefix") return "Prefix"
  if (m === "regex") return "Regex"
  return "Suffix ID"
}

function validateRegex(pattern: string, matchType: PacingMatchType): string | null {
  if (matchType !== "regex") return null
  const p = pattern.trim()
  if (!p) return null
  try {
    // eslint-disable-next-line no-new
    new RegExp(p)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid regex"
  }
}

function mergeRow(base: PacingMapping, draft: RowDraft | undefined): PacingMapping {
  if (!draft) return base
  return { ...base, ...draft }
}

function rowDraftDirty(base: PacingMapping, draft: RowDraft | undefined): boolean {
  if (!draft || Object.keys(draft).length === 0) return false
  if (base.created_via === "search_sync") {
    return draft.is_active !== undefined && draft.is_active !== base.is_active
  }
  const m = mergeRow(base, draft)
  return (
    (draft.campaign_name_pattern !== undefined && m.campaign_name_pattern !== base.campaign_name_pattern) ||
    (draft.group_name_pattern !== undefined && m.group_name_pattern !== base.group_name_pattern) ||
    (draft.av_line_item_code !== undefined && m.av_line_item_code !== base.av_line_item_code) ||
    (draft.budget_split_pct !== undefined && m.budget_split_pct !== base.budget_split_pct) ||
    (draft.line_item_budget !== undefined && m.line_item_budget !== base.line_item_budget) ||
    (draft.start_date !== undefined && m.start_date !== base.start_date) ||
    (draft.end_date !== undefined && m.end_date !== base.end_date) ||
    (draft.is_active !== undefined && m.is_active !== base.is_active)
  )
}

/** Same publish/discard affordances as `InlineEditCell` — one bar per row. */
function RowPublishBar({
  visible,
  busy,
  onPublish,
  onDiscard,
}: {
  visible: boolean
  busy: boolean
  onPublish: () => void
  onDiscard: () => void
}) {
  if (!visible) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 px-2 text-xs"
        disabled={busy}
        onClick={() => void onPublish()}
      >
        Publish
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={onDiscard}>
        Discard
      </Button>
    </div>
  )
}

export function PacingMappingsPageClient() {
  const { toast } = useToast()
  const filters = usePacingFilterStore((s) => s.filters)
  const assignedClientIds = usePacingFilterStore((s) => s.assignedClientIds)
  const isScopedTenant = assignedClientIds.length > 0

  const [rows, setRows] = useState<PacingMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [clientOptions, setClientOptions] = useState<ClientOpt[]>([])
  const [planLabels, setPlanLabels] = useState<Map<number, string>>(() => new Map())

  const [platformFilter, setPlatformFilter] = useState<string>("")
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all")

  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [rowSaving, setRowSaving] = useState<number | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMapping, setEditorMapping] = useState<PacingMapping | null>(null)

  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [newMappingConfirmOpen, setNewMappingConfirmOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchPacingMappings()
      setRows(res.data)
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not load mappings",
        description: e instanceof Error ? e.message : "Request failed",
      })
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/clients")
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        let options = (Array.isArray(data) ? data : [])
          .map((c: Record<string, unknown>) => ({
            value: String(c.id),
            label: String(c.mp_client_name || c.clientname_input || c.name || `Client ${c.id}`),
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
        if (isScopedTenant) {
          const allow = new Set(assignedClientIds)
          options = options.filter((o) => allow.has(o.value))
        }
        setClientOptions(options)
      } catch {
        if (!cancelled) setClientOptions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assignedClientIds, isScopedTenant])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/media_plans")
        if (!res.ok) return
        const raw = await res.json()
        if (cancelled) return
        const list = Array.isArray(raw) ? raw : []
        const m = new Map<number, string>()
        for (const p of list as Record<string, unknown>[]) {
          const idRaw = p.id ?? p.media_plan_version_id
          const id = typeof idRaw === "number" ? idRaw : Number.parseInt(String(idRaw ?? ""), 10)
          if (!Number.isFinite(id)) continue
          const mba = String(p.mba_number ?? "")
          const camp = String(p.topline_campaign_name ?? p.campaign_name ?? p.mp_campaignname ?? "").slice(0, 48)
          m.set(id, [mba, camp].filter(Boolean).join(" · ") || `Plan ${id}`)
        }
        setPlanLabels(m)
      } catch {
        if (!cancelled) setPlanLabels(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const clientLabelById = useMemo(() => {
    const o = new Map<string, string>()
    for (const c of clientOptions) o.set(c.value, c.label)
    return o
  }, [clientOptions])

  const filteredRows = useMemo(() => {
    let out = rows
    const cSet = new Set(filters.client_ids)
    if (cSet.size > 0) {
      out = out.filter((r) => cSet.has(String(r.clients_id)))
    }
    const mSet = new Set(filters.media_types.map((x) => x.toLowerCase()))
    if (mSet.size > 0) {
      out = out.filter((r) => r.media_type && mSet.has(String(r.media_type).toLowerCase()))
    }
    if (platformFilter.trim()) {
      out = out.filter((r) => String(r.platform ?? "").toLowerCase() === platformFilter.trim().toLowerCase())
    }
    if (activeFilter === "active") out = out.filter((r) => r.is_active)
    if (activeFilter === "inactive") out = out.filter((r) => !r.is_active)
    return out
  }, [rows, filters.client_ids, filters.media_types, platformFilter, activeFilter])

  const platformFilterOptions: ComboboxOption[] = useMemo(() => {
    return [{ value: "", label: "All platforms" }, ...allPlatformFilterOptions()]
  }, [])

  const selectedVisibleCount = useMemo(
    () => filteredRows.filter((r) => selected.has(r.id)).length,
    [filteredRows, selected]
  )

  const allSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id))
  const someSelected = filteredRows.some((r) => selected.has(r.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected((s) => {
        const n = new Set(s)
        for (const r of filteredRows) n.delete(r.id)
        return n
      })
      return
    }
    setSelected((s) => {
      const n = new Set(s)
      for (const r of filteredRows) n.add(r.id)
      return n
    })
  }

  const patchDraft = (id: number, patch: RowDraft) => {
    setDrafts((d) => {
      const cur = { ...(d[id] ?? {}), ...patch }
      const cleaned = Object.fromEntries(
        Object.entries(cur).filter(([, v]) => v !== undefined)
      ) as RowDraft
      return { ...d, [id]: cleaned }
    })
  }

  const discardDraft = (id: number) => {
    setDrafts((d) => {
      const n = { ...d }
      delete n[id]
      return n
    })
  }

  const publishRow = async (base: PacingMapping) => {
    const d = drafts[base.id]
    const merged = mergeRow(base, d)

    if (base.created_via === "search_sync") {
      if (merged.is_active === base.is_active) return
      setRowSaving(base.id)
      try {
        await updatePacingMapping(base.id, { is_active: merged.is_active })
        discardDraft(base.id)
        toast({
          title: "Mapping saved",
          description: "Pacing data will refresh within a few seconds.",
        })
        await load()
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: e instanceof Error ? e.message : "Request failed",
        })
      } finally {
        setRowSaving(null)
      }
      return
    }

    const err =
      merged.match_type === "suffix_id"
        ? validateSuffixIdLineItemCode(merged.av_line_item_code ?? "")
        : validateRegex(merged.campaign_name_pattern ?? "", merged.match_type) ??
          (merged.match_type === "regex" && (merged.group_name_pattern ?? "").trim()
            ? validateRegex(merged.group_name_pattern ?? "", "regex")
            : null)
    if (err) {
      toast({ variant: "destructive", title: "Cannot save", description: err })
      return
    }
    if (merged.end_date && merged.start_date && merged.end_date < merged.start_date) {
      toast({ variant: "destructive", title: "Invalid dates", description: "End date must be on or after start date." })
      return
    }
    const split = Number(merged.budget_split_pct)
    if (!Number.isFinite(split) || split < 0 || split > 100) {
      toast({
        variant: "destructive",
        title: "Invalid split %",
        description: "Budget split % must be between 0 and 100.",
      })
      return
    }
    const budget = merged.line_item_budget
    if (budget == null || !Number.isFinite(Number(budget)) || Number(budget) <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid budget",
        description: "Line item budget must be greater than 0.",
      })
      return
    }

    setRowSaving(base.id)
    try {
      await updatePacingMapping(base.id, {
        campaign_name_pattern: merged.campaign_name_pattern,
        group_name_pattern: merged.group_name_pattern,
        av_line_item_code:
          merged.match_type === "suffix_id" ? (merged.av_line_item_code ?? null) : null,
        budget_split_pct: merged.budget_split_pct,
        line_item_budget: merged.line_item_budget,
        start_date: merged.start_date,
        end_date: merged.end_date,
        is_active: merged.is_active,
      })
      discardDraft(base.id)
      toast({
        title: "Mapping saved",
        description: "Pacing data will refresh within a few seconds.",
      })
      await load()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: e instanceof Error ? e.message : "Request failed",
      })
    } finally {
      setRowSaving(null)
    }
  }

  const runBulk = async (mode: "activate" | "deactivate" | "delete") => {
    const ids = filteredRows.filter((r) => selected.has(r.id)).map((r) => r.id)
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      if (mode === "delete") {
        for (const id of ids) {
          await deletePacingMapping(id)
        }
        toast({ title: "Deleted", description: `${ids.length} mapping(s) removed.` })
      } else {
        const flag = mode === "activate"
        for (const id of ids) {
          await updatePacingMapping(id, { is_active: flag })
        }
        toast({
          title: flag ? "Activated" : "Deactivated",
          description: `${ids.length} mapping(s) updated.`,
        })
      }
      setSelected(new Set())
      await load()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Bulk action failed",
        description: e instanceof Error ? e.message : "Request failed",
      })
    } finally {
      setBulkBusy(false)
      setConfirmDeleteOpen(false)
    }
  }

  const openNewMappingEditor = () => {
    setEditorMapping(null)
    setEditorOpen(true)
  }

  const onClickNewMapping = () => {
    if (mediaTypeHasAutoSyncSource("search")) {
      setNewMappingConfirmOpen(true)
      return
    }
    openNewMappingEditor()
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Mappings</h1>
          <p className="text-sm text-muted-foreground">
            Wire Snowflake delivery to AV line items. Use test match in the editor before saving new rules.
          </p>
        </header>
        <Button type="button" onClick={onClickNewMapping} className="shrink-0">
          New mapping
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 shadow-sm md:flex-row md:flex-wrap md:items-end">
        <div className="space-y-1.5 md:w-56">
          <Label className="text-xs text-muted-foreground">Platform</Label>
          <Combobox
            options={platformFilterOptions}
            value={platformFilter}
            onValueChange={(v) => setPlatformFilter(v ?? "")}
            placeholder="All platforms"
          />
        </div>
        <div className="space-y-1.5 md:w-52">
          <Label className="text-xs text-muted-foreground">Active</Label>
          <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as "all" | "active" | "inactive")}>
            <SelectTrigger>
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground md:ml-auto md:max-w-md md:text-right">
          Client and media type filters use the pacing toolbar above (shared with Overview).
        </p>
      </div>

      {someSelected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">{selectedVisibleCount} selected</span>
          <Button type="button" size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void runBulk("activate")}>
            Activate
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void runBulk("deactivate")}>
            Deactivate
          </Button>
          <Button type="button" size="sm" variant="destructive" disabled={bulkBusy} onClick={() => setConfirmDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      ) : null}

      <div className="rounded-lg border border-border/60 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={() => toggleAll()}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Media plan</TableHead>
              <TableHead>AV line item</TableHead>
              <TableHead>Media type</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead className="text-right">% split</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={14} className="text-sm text-muted-foreground">
                  Loading mappings…
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-sm text-muted-foreground">
                  No mappings match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((raw) => {
                const row = mergeRow(raw, drafts[raw.id])
                const dirty = rowDraftDirty(raw, drafts[raw.id])
                const readOnlySynced = raw.created_via === "search_sync"
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      dirty &&
                        "bg-amber-500/[0.07] shadow-[inset_0_0_0_2px] shadow-amber-500/25"
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => {
                          setSelected((s) => {
                            const n = new Set(s)
                            if (v === true) n.add(row.id)
                            else n.delete(row.id)
                            return n
                          })
                        }}
                        aria-label={`Select mapping ${row.id}`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {clientLabelById.get(String(row.clients_id)) ?? row.clients_id}
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate text-sm" title={planLabels.get(row.media_plan_id ?? -1) ?? ""}>
                      {row.media_plan_id != null ? planLabels.get(row.media_plan_id) ?? `#${row.media_plan_id}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[12rem] text-sm">
                      <span className="line-clamp-2" title={row.av_line_item_label ?? row.av_line_item_id}>
                        {row.av_line_item_label ?? row.av_line_item_id}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize">{row.media_type ?? "—"}</TableCell>
                    <TableCell className="text-sm">{labelForPlatform(row.platform)}</TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {matchTypeLabel(row.match_type)}
                        {readOnlySynced ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            auto-synced
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-[10rem] max-w-[18rem]">
                      {row.match_type === "suffix_id" ? (
                        readOnlySynced ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex cursor-default flex-wrap items-center gap-1">
                                <Badge variant="secondary" className="text-[10px] font-normal">
                                  code
                                </Badge>
                                <span className="font-mono text-xs">{row.av_line_item_code ?? "—"}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Edit the source search container to change this mapping.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge variant="secondary" className="text-[10px] font-normal">
                                code
                              </Badge>
                            </div>
                            <Input
                              className="h-8 font-mono text-xs"
                              value={row.av_line_item_code ?? ""}
                              onChange={(e) => patchDraft(raw.id, { av_line_item_code: e.target.value })}
                              placeholder="Line item code"
                            />
                          </div>
                        )
                      ) : (
                        <div className="space-y-1">
                          <Input
                            className="h-8 text-xs"
                            value={row.campaign_name_pattern ?? ""}
                            onChange={(e) => patchDraft(raw.id, { campaign_name_pattern: e.target.value })}
                            disabled={readOnlySynced}
                          />
                          <Input
                            className="h-8 text-xs"
                            value={row.group_name_pattern ?? ""}
                            onChange={(e) => {
                              const t = e.target.value
                              patchDraft(raw.id, { group_name_pattern: t.trim() ? t : null })
                            }}
                            placeholder="Group pattern (optional)"
                            disabled={readOnlySynced}
                          />
                          {!(row.group_name_pattern ?? "").trim() ? (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              Campaign-level
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              Ad group / asset group-level
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto h-8 w-20 text-right text-xs"
                        min={0}
                        max={100}
                        step={0.1}
                        value={Number.isFinite(row.budget_split_pct) ? row.budget_split_pct : ""}
                        onChange={(e) => {
                          const v = Number.parseFloat(e.target.value)
                          if (e.target.value === "" || Number.isNaN(v)) return
                          patchDraft(raw.id, { budget_split_pct: v })
                        }}
                        disabled={readOnlySynced}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="ml-auto h-8 w-24 text-right text-xs"
                        min={0}
                        step={0.01}
                        value={row.line_item_budget ?? ""}
                        onChange={(e) =>
                          patchDraft(raw.id, { line_item_budget: Number.parseFloat(e.target.value) || null })
                        }
                        disabled={readOnlySynced}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        className="h-8 w-[9.5rem] text-xs"
                        value={(row.start_date ?? "").slice(0, 10)}
                        onChange={(e) => patchDraft(raw.id, { start_date: e.target.value || null })}
                        disabled={readOnlySynced}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        className="h-8 w-[9.5rem] text-xs"
                        value={(row.end_date ?? "").slice(0, 10)}
                        onChange={(e) => patchDraft(raw.id, { end_date: e.target.value || null })}
                        disabled={readOnlySynced}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={(v) => patchDraft(raw.id, { is_active: v })}
                        aria-label="Active"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 px-2"
                          onClick={() => {
                            setEditorMapping(raw)
                            setEditorOpen(true)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        {dirty ? (
                          <InlineEditActions
                            busy={rowSaving === raw.id}
                            onPublish={() => void publishRow(raw)}
                            onDiscard={() => discardDraft(raw.id)}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <MappingEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mapping={editorMapping}
        onSaved={() => void load()}
        clientOptions={clientOptions}
        isScopedTenant={isScopedTenant}
        assignedClientIds={assignedClientIds}
        readOnlyExceptActive={editorMapping?.created_via === "search_sync"}
      />

      <AlertDialog open={newMappingConfirmOpen} onOpenChange={setNewMappingConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Manual override?</AlertDialogTitle>
            <AlertDialogDescription>
              {getAutoSyncNewMappingConfirmMessage("search")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault()
                setNewMappingConfirmOpen(false)
                openNewMappingEditor()
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedVisibleCount} mapping(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the rules from Xano and Snowflake. Delivery pacing may change immediately after sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkBusy}
              onClick={(ev) => {
                ev.preventDefault()
                void runBulk("delete")
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  )
}
