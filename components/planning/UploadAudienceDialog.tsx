"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { formatAgeBandLabel } from "@/app/tools/behavioural-planner/lib/ageBands"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getClientDisplayName } from "@/lib/clients/slug"
import type { PlanningAgeBand, PlanningChannelMeta, PlanningState } from "@/lib/planning/types"
import { PLANNING_AGE_BANDS, PLANNING_STATES } from "@/lib/planning/types"
import { extractRmDefinition } from "@/lib/planning/upload/extractRmDefinition"
import {
  isPlanningEngineLeaf,
  isRmDemographicSection,
  mapRoyMorganToChannels,
  type RmMappingOptions,
  type RmMappingOverrides,
} from "@/lib/planning/upload/mapRoyMorganToChannels"
import type { RmBlock, RmSheet, RmWorkbookParse } from "@/lib/planning/upload/royMorganTypes"
import type { UploadedAudienceListRow } from "@/lib/planning/upload/uploadedAudienceListTypes"
import { cn } from "@/lib/utils"
import { UploadCoveragePanel } from "./UploadCoveragePanel"

const MAX_BYTES = 10 * 1024 * 1024
const IGNORE_VALUE = "__ignore__"
const AGENCY_VALUE = "__agency__"

type ClientRow = {
  id?: number
  mp_client_name?: string
  client_name?: string
  clientname_input?: string
  name?: string
}

type Step = 1 | 2 | 3 | 4

type PickedBlock = {
  sheet: RmSheet
  block: RmBlock
}

type UploadAudienceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channels: PlanningChannelMeta[]
  defaultClientId: number | null
  onSaved: (row: UploadedAudienceListRow) => void
}

const EMPTY_OPTIONS: RmMappingOptions = {
  inheritRollupIds: [],
  benchmarkOnlyIds: [],
}

const STATE_LABELS: Record<PlanningState, string> = {
  NAT: "National",
  NSW: "NSW",
  VIC: "VIC",
  QLD: "QLD",
  SA: "SA",
  WA: "WA",
  TAS: "TAS",
  NT: "NT",
}

const GENDERS: { id: "all" | "male" | "female"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
]

function channelLabel(ch: PlanningChannelMeta): string {
  return ch.level2 ?? ch.level1 ?? ch.channel_id
}

export function UploadAudienceDialog({
  open,
  onOpenChange,
  channels,
  defaultClientId,
  onSaved,
}: UploadAudienceDialogProps) {
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadId, setUploadId] = useState<number | null>(null)
  const [parse, setParse] = useState<RmWorkbookParse | null>(null)
  const [capHit, setCapHit] = useState<string[]>([])
  const [picked, setPicked] = useState<PickedBlock | null>(null)
  const [overrides, setOverrides] = useState<RmMappingOverrides>({})
  const [options, setOptions] = useState<RmMappingOptions>(EMPTY_OPTIONS)
  const [name, setName] = useState("")
  const [clientsId, setClientsId] = useState<string>(
    defaultClientId != null ? String(defaultClientId) : AGENCY_VALUE
  )
  const [editDefinition, setEditDefinition] = useState(false)
  const [definition, setDefinition] = useState<{
    states: PlanningState[]
    ageBands: PlanningAgeBand[]
    gender: "all" | "male" | "female"
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [skippedOpen, setSkippedOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(1)
    setFile(null)
    setUploading(false)
    setUploadError(null)
    setUploadId(null)
    setParse(null)
    setCapHit([])
    setPicked(null)
    setOverrides({})
    setOptions(EMPTY_OPTIONS)
    setName("")
    setClientsId(defaultClientId != null ? String(defaultClientId) : AGENCY_VALUE)
    setEditDefinition(false)
    setDefinition(null)
    setSaving(false)
    setSaveError(null)
    setSkippedOpen(false)
  }, [open, defaultClientId])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/clients")
        if (!res.ok) return
        const data = (await res.json()) as unknown
        if (cancelled) return
        setClients(Array.isArray(data) ? (data as ClientRow[]) : [])
      } catch {
        if (!cancelled) setClients([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const leafCount = useMemo(
    () => channels.filter((c) => isPlanningEngineLeaf(c)).length,
    [channels]
  )

  const mapping = useMemo(() => {
    if (!picked) return null
    return mapRoyMorganToChannels({
      block: picked.block,
      channels,
      overrides,
      options,
    })
  }, [picked, channels, overrides, options])

  const channelRows = useMemo(() => {
    if (!picked) return []
    return picked.block.rows.filter((r) => !isRmDemographicSection(r.section))
  }, [picked])

  const matchedByRow = useMemo(() => {
    const map = new Map<number, string>()
    if (!mapping) return map
    for (const m of mapping.mapped) {
      if (m.sourceRowIndex == null) continue
      if (m.provenance !== "matched") continue
      map.set(m.sourceRowIndex, m.channelId)
    }
    return map
  }, [mapping])

  const suggestionByRow = useMemo(() => {
    const map = new Map<number, string | null>()
    if (!mapping) return map
    for (const u of mapping.unmatchedRows) {
      map.set(u.rowIndex, u.suggestion)
    }
    return map
  }, [mapping])

  const channelGroups = useMemo(() => {
    const groups = new Map<string, PlanningChannelMeta[]>()
    for (const ch of channels) {
      if (ch.channel_id === "POPULATION") continue
      const g = ch.level1 ?? "Other"
      const list = groups.get(g) ?? []
      list.push(ch)
      groups.set(g, list)
    }
    return [...groups.entries()].toSorted((a, b) => a[0].localeCompare(b[0]))
  }, [channels])

  const coveredIds = useMemo(() => {
    return new Set(mapping?.mapped.map((m) => m.channelId) ?? [])
  }, [mapping])

  const clientOptions = useMemo(
    () =>
      clients
        .map((c) => ({
          id: typeof c.id === "number" ? c.id : null,
          name: getClientDisplayName(c),
        }))
        .filter((c) => c.id != null && c.name)
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    [clients]
  )

  const skippedEntries = useMemo(() => {
    if (!parse) return []
    const out: { sheetName: string; reason: string }[] = []
    for (const sheet of parse.sheets) {
      for (const s of sheet.skipped) {
        out.push({ sheetName: sheet.sheetName, reason: s.reason })
      }
    }
    return out
  }, [parse])

  async function uploadFile(next: File) {
    setFile(next)
    setUploadError(null)
    if (next.size > MAX_BYTES) {
      setUploadError("File must be 10 MB or smaller.")
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", next)
      const res = await fetch("/api/planning/uploads", { method: "POST", body })
      const json = (await res.json().catch(() => null)) as
        | { upload_id?: number; parse?: RmWorkbookParse; cap_hit?: string[]; error?: string }
        | null
      if (!res.ok) {
        throw new Error(json?.error ?? `Upload failed (${res.status})`)
      }
      if (json?.upload_id == null || json.parse == null) {
        throw new Error("Upload response missing parse")
      }
      setUploadId(json.upload_id)
      setParse(json.parse)
      setCapHit(Array.isArray(json.cap_hit) ? json.cap_hit : [])
    } catch (err) {
      setUploadId(null)
      setParse(null)
      setUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function pickBlock(sheet: RmSheet, block: RmBlock) {
    if (block.isBase) return
    setPicked({ sheet, block })
    setOverrides({})
    setOptions(EMPTY_OPTIONS)
    setName(`${block.columnName} (${parse?.fileName ?? file?.name ?? "workbook"})`)
    setDefinition(extractRmDefinition(block))
    setEditDefinition(false)
  }

  function selectValueForRow(rowIndex: number): string | undefined {
    if (Object.prototype.hasOwnProperty.call(overrides, rowIndex)) {
      const ov = overrides[rowIndex]
      return ov == null ? IGNORE_VALUE : ov
    }
    const auto = matchedByRow.get(rowIndex)
    return auto
  }

  function onRowChannelChange(rowIndex: number, value: string) {
    setOverrides((prev) => {
      const next = { ...prev }
      if (value === IGNORE_VALUE) {
        next[rowIndex] = null
        return next
      }
      const auto = matchedByRow.get(rowIndex)
      if (auto === value && !Object.prototype.hasOwnProperty.call(prev, rowIndex)) {
        return prev
      }
      if (auto === value) {
        delete next[rowIndex]
        return next
      }
      next[rowIndex] = value
      return next
    })
  }

  async function save() {
    if (uploadId == null || !picked || !definition) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/planning/uploads/${uploadId}/audiences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet_name: picked.sheet.sheetName,
          block_id: picked.block.blockId,
          name: name.trim(),
          clients_id: clientsId === AGENCY_VALUE ? null : Number(clientsId),
          overrides,
          options,
          definition: {
            states: definition.states,
            ageBands: definition.ageBands,
            gender: definition.gender,
            provenance: {
              fileName: parse?.fileName ?? file?.name ?? null,
              waveCode: picked.sheet.waveCode,
              filterLabel: picked.block.filter ?? picked.sheet.filter,
            },
          },
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | (UploadedAudienceListRow & { error?: string })
        | { error?: string }
        | null
      if (!res.ok) {
        throw new Error(
          json && "error" in json && json.error ? json.error : `Save failed (${res.status})`
        )
      }
      onSaved({
        ...(json as UploadedAudienceListRow),
        file_name: parse?.fileName ?? file?.name ?? null,
      })
      onOpenChange(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const canNext1 = Boolean(parse && uploadId != null && !uploading)
  const canNext2 = Boolean(picked && !picked.block.isBase)
  const canNext3 = Boolean(mapping && mapping.scoreableCount > 0)
  const canSave = Boolean(name.trim() && definition && !saving)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload a Roy Morgan run</DialogTitle>
          <p className="text-xs text-muted-foreground">Step {step} of 4</p>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-panel px-4 py-8 text-center text-sm",
                "hover:bg-table-row-hover"
              )}
            >
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="sr-only"
                onChange={(e) => {
                  const next = e.target.files?.[0]
                  if (next) void uploadFile(next)
                }}
              />
              {file ? (
                <span>
                  {file.name}{" "}
                  <span className="text-muted-foreground">
                    ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </span>
              ) : (
                <span>Choose a Roy Morgan .xlsx (max 10 MB)</span>
              )}
            </label>
            {uploading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Parsing workbook…
              </p>
            ) : null}
            {uploadError ? (
              <p className="text-sm text-status-critical-fg">{uploadError}</p>
            ) : null}
            {parse?.warnings.map((w) => (
              <p key={w} className="text-xs text-status-behind-fg">
                {w}
              </p>
            ))}
            {capHit.length > 0 ? (
              <p className="text-xs text-status-behind-fg">
                Transport cap hit: {capHit.join(", ")}. Full parse is stored; this preview is
                truncated.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 2 && parse ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick the audience column. TOTAL columns are the universe base and cannot be selected.
            </p>
            <ul className="space-y-2">
              {parse.sheets.flatMap((sheet) =>
                sheet.blocks.map((block) => {
                  const n = block.unweightedN ?? "—"
                  const pop = block.popn000 ?? "—"
                  return (
                    <li key={`${sheet.sheetName}:${block.blockId}`}>
                      <button
                        type="button"
                        disabled={block.isBase}
                        onClick={() => pickBlock(sheet, block)}
                        className={cn(
                          "w-full rounded-input border border-border p-3 text-left text-sm",
                          block.isBase && "cursor-not-allowed opacity-60",
                          picked?.block.blockId === block.blockId &&
                            picked.sheet.sheetName === sheet.sheetName &&
                            "ring-2 ring-ring"
                        )}
                      >
                        <span>
                          {sheet.sheetName} · {block.columnName} — n {n}, {pop}k people
                        </span>
                        {block.isBase ? (
                          <Badge variant="outline" size="sm" className="ml-2 font-normal">
                            base
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            {skippedEntries.length > 0 ? (
              <details
                open={skippedOpen}
                onToggle={(e) => setSkippedOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Skipped ({skippedEntries.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {skippedEntries.map((s, i) => (
                    <li key={`${s.sheetName}:${i}`}>
                      {s.sheetName}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        {step === 3 && picked && mapping ? (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Source label</th>
                    <th className="px-3 py-2">Section</th>
                    <th className="px-3 py-2 text-right">Reach %</th>
                    <th className="px-3 py-2 text-right">Index</th>
                    <th className="px-3 py-2">Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {channelRows.map((row) => {
                    const overridden = Object.prototype.hasOwnProperty.call(
                      overrides,
                      row.rowIndex
                    )
                    const auto = !overridden && matchedByRow.has(row.rowIndex)
                    const suggestionId = suggestionByRow.get(row.rowIndex)
                    const suggestionMeta = suggestionId
                      ? channels.find((c) => c.channel_id === suggestionId)
                      : undefined
                    const value = selectValueForRow(row.rowIndex)
                    return (
                      <tr key={row.rowIndex} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{row.label}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.section ?? "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="num tabular-nums">
                            {row.reachPct == null ? "—" : `${(row.reachPct * 100).toFixed(1)}%`}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="num tabular-nums">{row.index ?? "—"}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Select
                              value={value}
                              onValueChange={(v) => onRowChannelChange(row.rowIndex, v)}
                            >
                              <SelectTrigger className="h-9 w-[220px]">
                                <SelectValue
                                  placeholder={
                                    suggestionMeta
                                      ? `Suggested: ${channelLabel(suggestionMeta)}`
                                      : "Choose channel…"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={IGNORE_VALUE}>Ignore</SelectItem>
                                {channelGroups.map(([level1, list]) => (
                                  <SelectGroup key={level1}>
                                    <SelectLabel>{level1}</SelectLabel>
                                    {list.map((ch) => (
                                      <SelectItem key={ch.channel_id} value={ch.channel_id}>
                                        {channelLabel(ch)}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
                            {auto ? (
                              <Badge
                                variant="outline"
                                size="sm"
                                className="font-normal text-muted-foreground"
                              >
                                auto
                              </Badge>
                            ) : null}
                            {!auto && !overridden && suggestionMeta ? (
                              <span className="text-[11px] text-muted-foreground">
                                Confirm the suggestion — it is not applied yet.
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <UploadCoveragePanel
              scoreableCount={mapping.scoreableCount}
              leafCount={leafCount}
              uncoveredLeafIds={[
                ...mapping.uncoveredLeafIds,
                ...mapping.mapped
                  .filter(
                    (m) =>
                      m.provenance === "inherited" || m.provenance === "benchmark-only"
                  )
                  .map((m) => m.channelId),
              ]}
              coveredIds={coveredIds}
              channels={channels}
              filterLabel={picked.block.filter ?? picked.sheet.filter}
              options={options}
              onChangeOptions={setOptions}
            />
            {!canNext3 ? (
              <p className="text-xs text-status-critical-fg">
                No scoreable channels yet — map at least one planning leaf before continuing.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 4 && definition ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upload-audience-name">Name</Label>
              <Input
                id="upload-audience-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientsId} onValueChange={setClientsId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AGENCY_VALUE}>Agency-wide (no client)</SelectItem>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-card border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Definition
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditDefinition((v) => !v)}
                >
                  {editDefinition ? "Done" : "Edit"}
                </Button>
              </div>
              {editDefinition ? (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 text-[11px] text-muted-foreground">States</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PLANNING_STATES.map((s) => {
                        const active = definition.states.includes(s)
                        return (
                          <button
                            key={s}
                            type="button"
                            className="rounded-full border-0 bg-transparent p-0"
                            onClick={() => {
                              setDefinition((d) => {
                                if (!d) return d
                                if (s === "NAT") return { ...d, states: ["NAT"] }
                                let next = d.states.filter((x) => x !== "NAT")
                                if (next.includes(s)) next = next.filter((x) => x !== s)
                                else next = [...next, s]
                                if (next.length === 0) next = ["NAT"]
                                return { ...d, states: next }
                              })
                            }}
                          >
                            <Badge variant={active ? "info" : "outline"} size="sm">
                              {STATE_LABELS[s]}
                            </Badge>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] text-muted-foreground">Age</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PLANNING_AGE_BANDS.map((b) => {
                        const active = definition.ageBands.includes(b)
                        return (
                          <button
                            key={b}
                            type="button"
                            className="rounded-full border-0 bg-transparent p-0"
                            onClick={() => {
                              setDefinition((d) => {
                                if (!d) return d
                                const next = d.ageBands.includes(b)
                                  ? d.ageBands.filter((x) => x !== b)
                                  : [...d.ageBands, b]
                                return {
                                  ...d,
                                  ageBands: next.length > 0 ? next : d.ageBands,
                                }
                              })
                            }}
                          >
                            <Badge variant={active ? "info" : "outline"} size="sm">
                              {b}
                            </Badge>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] text-muted-foreground">Gender</p>
                    <div className="flex flex-wrap gap-1.5">
                      {GENDERS.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="rounded-full border-0 bg-transparent p-0"
                          onClick={() =>
                            setDefinition((d) => (d ? { ...d, gender: g.id } : d))
                          }
                        >
                          <Badge
                            variant={definition.gender === g.id ? "info" : "outline"}
                            size="sm"
                          >
                            {g.label}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm">
                  {definition.states.map((s) => STATE_LABELS[s]).join(", ")}
                  {" · "}
                  {formatAgeBandLabel(definition.ageBands)}
                  {" · "}
                  {GENDERS.find((g) => g.id === definition.gender)?.label ?? "All"}
                </p>
              )}
            </div>
            {saveError ? (
              <p className="text-sm text-status-critical-fg">{saveError}</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => (s - 1) as Step)}>
              Back
            </Button>
          ) : null}
          {step < 4 ? (
            <Button
              type="button"
              disabled={
                (step === 1 && !canNext1) ||
                (step === 2 && !canNext2) ||
                (step === 3 && !canNext3)
              }
              title={
                step === 3 && !canNext3
                  ? "No scoreable channels yet — map at least one planning leaf before continuing."
                  : undefined
              }
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Next
            </Button>
          ) : (
            <Button type="button" disabled={!canSave} onClick={() => void save()}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
