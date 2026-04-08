"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronsUpDown, Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  MATCH_TYPE_OPTIONS,
  mediaPlanBelongsToClient,
  mediaTypeComboboxOptions,
  parseMediaPlanVersionId,
} from "@/lib/pacing/mappingFormConstants"
import { validateSuffixIdLineItemCode } from "@/lib/pacing/suffixIdLineItemCode"
import {
  getDefaultMatchTypeForNewMapping,
  platformComboboxOptionsForMediaType,
} from "@/lib/pacing/media-type-config"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import {
  createPacingMapping,
  fetchPacingLineItems,
  postPacingTestMatch,
  updatePacingMapping,
} from "@/lib/xano/pacing-client"
import type {
  LineItemPacingRow,
  PacingMapping,
  PacingMatchType,
  PacingTestMatchRow,
} from "@/lib/xano/pacing-types"
import { useToast } from "@/components/ui/use-toast"

type ClientOpt = { value: string; label: string }

type MappingEditorProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = create */
  mapping: PacingMapping | null
  onSaved: () => void
  clientOptions: ClientOpt[]
  isScopedTenant: boolean
  assignedClientIds: string[]
  /** Auto-synced rows: only Active can be changed */
  readOnlyExceptActive?: boolean
}

type FormState = {
  clients_id: string
  media_plan_id: string
  av_line_item_id: string
  av_line_item_label: string
  media_type: string
  platform: string
  match_type: PacingMatchType
  campaign_name_pattern: string
  group_name_pattern: string
  av_line_item_code: string
  budget_split_pct: string
  line_item_budget: string
  start_date: string
  end_date: string
  is_active: boolean
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
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

function formFromMapping(m: PacingMapping): FormState {
  return {
    clients_id: String(m.clients_id),
    media_plan_id: m.media_plan_id != null ? String(m.media_plan_id) : "",
    av_line_item_id: m.av_line_item_id,
    av_line_item_label: m.av_line_item_label ?? "",
    media_type: String(m.media_type ?? "search").toLowerCase(),
    platform: String(m.platform ?? "").toLowerCase(),
    match_type: m.match_type,
    campaign_name_pattern: m.campaign_name_pattern ?? "",
    group_name_pattern: m.group_name_pattern ?? "",
    av_line_item_code: m.av_line_item_code ?? "",
    budget_split_pct: String(m.budget_split_pct ?? 100),
    line_item_budget: m.line_item_budget != null ? String(m.line_item_budget) : "",
    start_date: m.start_date ?? "",
    end_date: m.end_date ?? "",
    is_active: Boolean(m.is_active),
  }
}

function defaultForm(filters: { date_from: string; date_to: string }, hintClientId: string): FormState {
  return {
    clients_id: hintClientId,
    media_plan_id: "",
    av_line_item_id: "",
    av_line_item_label: "",
    media_type: "search",
    platform: "google_ads",
    match_type: getDefaultMatchTypeForNewMapping("search"),
    campaign_name_pattern: "",
    group_name_pattern: "",
    av_line_item_code: "",
    budget_split_pct: "100",
    line_item_budget: "",
    start_date: filters.date_from,
    end_date: filters.date_to,
    is_active: true,
  }
}

export function MappingEditor({
  open,
  onOpenChange,
  mapping,
  onSaved,
  clientOptions,
  isScopedTenant,
  assignedClientIds,
  readOnlyExceptActive = false,
}: MappingEditorProps) {
  const { toast } = useToast()
  const filters = usePacingFilterStore((s) => s.filters)

  const hintClientId = useMemo(() => {
    if (filters.client_ids.length === 1) return filters.client_ids[0]!
    if (clientOptions.length === 1) return clientOptions[0]!.value
    return ""
  }, [filters.client_ids, clientOptions])

  const [form, setForm] = useState<FormState>(() => defaultForm(filters, hintClientId))
  const [saving, setSaving] = useState(false)
  const [mediaPlans, setMediaPlans] = useState<Record<string, unknown>[]>([])
  const [lineItemRows, setLineItemRows] = useState<LineItemPacingRow[]>([])
  const [lineItemOptions, setLineItemOptions] = useState<ComboboxOption[]>([])
  const [lineItemsLoading, setLineItemsLoading] = useState(false)

  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewRows, setPreviewRows] = useState<PacingTestMatchRow[]>([])
  const [previewMatchCount, setPreviewMatchCount] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (mapping) {
      setForm(formFromMapping(mapping))
    } else {
      setForm(defaultForm(filters, hintClientId))
    }
  }, [open, mapping, filters.date_from, filters.date_to, hintClientId])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/media_plans")
        if (!res.ok) return
        const raw = await res.json()
        if (cancelled) return
        setMediaPlans(Array.isArray(raw) ? raw : [])
      } catch {
        if (!cancelled) setMediaPlans([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const selectedClientLabel = useMemo(() => {
    const o = clientOptions.find((c) => c.value === form.clients_id)
    return o?.label?.trim().toLowerCase() ?? ""
  }, [clientOptions, form.clients_id])

  const mediaPlanOptions: ComboboxOption[] = useMemo(() => {
    if (!form.clients_id) return []
    const nameNorm = selectedClientLabel
    return mediaPlans
      .filter((p) => mediaPlanBelongsToClient(p, form.clients_id, nameNorm))
      .map((p) => {
        const id = parseMediaPlanVersionId(p)
        if (id === null) return null
        const mba = String(p.mba_number ?? "")
        const camp = String(p.topline_campaign_name ?? p.campaign_name ?? p.mp_campaignname ?? "").slice(0, 60)
        const label = [mba, camp].filter(Boolean).join(" · ") || `Plan ${id}`
        return { value: String(id), label }
      })
      .filter((x): x is ComboboxOption => x !== null)
  }, [form.clients_id, mediaPlans, selectedClientLabel])

  const platformOpts = useMemo(() => platformComboboxOptionsForMediaType(form.media_type), [form.media_type])

  useEffect(() => {
    const allowed = new Set(platformOpts.map((o) => o.value))
    if (!form.platform || !allowed.has(form.platform)) {
      const next = platformOpts[0]?.value ?? ""
      if (next && next !== form.platform) {
        setForm((f) => ({ ...f, platform: next }))
      }
    }
  }, [form.platform, platformOpts])

  useEffect(() => {
    if (!open || !form.clients_id || !form.media_plan_id) {
      setLineItemRows([])
      setLineItemOptions([])
      return
    }
    let cancelled = false
    setLineItemsLoading(true)
    void (async () => {
      try {
        const mpId = Number.parseInt(form.media_plan_id, 10)
        const res = await fetchPacingLineItems({
          clients_id: form.clients_id,
          media_plan_id: Number.isFinite(mpId) ? mpId : undefined,
          date_from: "2000-01-01",
          date_to: "2100-12-31",
        })
        if (cancelled) return
        setLineItemRows(res.data)
        setLineItemOptions(
          res.data.map((r) => ({
            value: r.av_line_item_id,
            label: [r.av_line_item_label ?? r.av_line_item_id, r.mba_number].filter(Boolean).join(" · "),
          }))
        )
      } catch {
        if (!cancelled) {
          setLineItemRows([])
          setLineItemOptions([])
        }
      } finally {
        if (!cancelled) setLineItemsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, form.clients_id, form.media_plan_id])

  const debouncedPreview = useDebounced(
    {
      platform: form.platform,
      match_type: form.match_type,
      campaign_name_pattern: form.campaign_name_pattern,
      group_name_pattern: form.group_name_pattern,
      av_line_item_code: form.av_line_item_code,
      start_date: form.start_date,
      end_date: form.end_date,
    },
    500
  )

  useEffect(() => {
    if (!open) return
    if (debouncedPreview.match_type === "suffix_id") {
      const code = debouncedPreview.av_line_item_code.trim()
      if (!code) {
        setPreviewRows([])
        setPreviewMatchCount(0)
        setPreviewError(null)
        setPreviewLoading(false)
        return
      }
      const codeErr = validateSuffixIdLineItemCode(code)
      if (codeErr) {
        setPreviewError(codeErr)
        setPreviewRows([])
        setPreviewMatchCount(0)
        setPreviewLoading(false)
        return
      }
    } else {
      const camp = debouncedPreview.campaign_name_pattern.trim()
      if (!camp) {
        setPreviewRows([])
        setPreviewMatchCount(0)
        setPreviewError(null)
        setPreviewLoading(false)
        return
      }
    }
    const regexErr = validateRegex(
      debouncedPreview.match_type === "regex" ? debouncedPreview.campaign_name_pattern : "",
      debouncedPreview.match_type
    )
    if (regexErr) {
      setPreviewError(regexErr)
      setPreviewRows([])
      setPreviewMatchCount(0)
      setPreviewLoading(false)
      return
    }
    const g = debouncedPreview.group_name_pattern.trim()
    if (debouncedPreview.match_type === "regex" && g) {
      const gErr = validateRegex(g, "regex")
      if (gErr) {
        setPreviewError(gErr)
        setPreviewRows([])
        setPreviewMatchCount(0)
        setPreviewLoading(false)
        return
      }
    }
    if (!debouncedPreview.platform?.trim() || !debouncedPreview.start_date || !debouncedPreview.end_date) {
      setPreviewRows([])
      setPreviewMatchCount(0)
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    void (async () => {
      try {
        const res = await postPacingTestMatch({
          platform: debouncedPreview.platform.trim(),
          match_type: debouncedPreview.match_type,
          campaign_name_pattern: debouncedPreview.campaign_name_pattern,
          group_name_pattern: debouncedPreview.group_name_pattern.trim() || null,
          av_line_item_code:
            debouncedPreview.match_type === "suffix_id"
              ? debouncedPreview.av_line_item_code.trim()
              : null,
          start_date: debouncedPreview.start_date,
          end_date: debouncedPreview.end_date,
        })
        if (cancelled) return
        setPreviewRows(res.data.matches)
        setPreviewMatchCount(res.data.match_count)
      } catch (e) {
        if (cancelled) return
        setPreviewError(e instanceof Error ? e.message : "Preview failed")
        setPreviewRows([])
        setPreviewMatchCount(0)
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, debouncedPreview])

  const groupedPreview = useMemo(() => {
    const map = new Map<string, PacingTestMatchRow[]>()
    for (const r of previewRows) {
      const k = r.campaign_name?.trim() || "(unknown campaign)"
      const arr = map.get(k) ?? []
      arr.push(r)
      map.set(k, arr)
    }
    return [...map.entries()]
  }, [previewRows])

  const validateForSave = useCallback((): string | null => {
    if (!form.clients_id) return "Client is required."
    if (!form.av_line_item_id.trim()) return "AV line item is required."
    if (!form.media_type.trim()) return "Media type is required."
    if (!form.platform.trim()) return "Platform is required."
    if (form.match_type === "suffix_id") {
      const codeErr = validateSuffixIdLineItemCode(form.av_line_item_code)
      if (codeErr) return codeErr
    } else if (!form.campaign_name_pattern.trim()) {
      return "Campaign name pattern is required."
    }
    const regexErr = validateRegex(form.campaign_name_pattern, form.match_type)
    if (regexErr) return regexErr
    const g = form.group_name_pattern.trim()
    if (form.match_type === "regex" && g) {
      const gErr = validateRegex(g, "regex")
      if (gErr) return gErr
    }
    const split = Number.parseFloat(form.budget_split_pct)
    if (!Number.isFinite(split) || split < 0 || split > 100) return "Budget split % must be between 0 and 100."
    const budget = Number.parseFloat(form.line_item_budget)
    if (!Number.isFinite(budget) || budget <= 0) return "Line item budget must be greater than 0."
    if (!form.start_date || !form.end_date) return "Start and end dates are required."
    if (form.end_date < form.start_date) return "End date must be on or after start date."
    return null
  }, [form])

  const onSave = useCallback(async () => {
    const err = validateForSave()
    if (err) {
      toast({ variant: "destructive", title: "Cannot save", description: err })
      return
    }
    const split = Number.parseFloat(form.budget_split_pct)
    const budget = Number.parseFloat(form.line_item_budget)
    const mpRaw = form.media_plan_id.trim()
    const mpId = mpRaw ? Number.parseInt(mpRaw, 10) : null
    if (readOnlyExceptActive && mapping) {
      setSaving(true)
      try {
        await updatePacingMapping(mapping.id, { is_active: form.is_active })
        toast({
          title: "Mapping saved",
          description: "Pacing data will refresh within a few seconds.",
        })
        onOpenChange(false)
        onSaved()
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: e instanceof Error ? e.message : "Request failed",
        })
      } finally {
        setSaving(false)
      }
      return
    }

    const body = {
      clients_id: Number.parseInt(form.clients_id, 10),
      media_plan_id: mpId !== null && Number.isFinite(mpId) ? mpId : null,
      av_line_item_id: form.av_line_item_id.trim(),
      av_line_item_label: form.av_line_item_label.trim() || null,
      media_type: form.media_type.trim(),
      platform: form.platform.trim(),
      match_type: form.match_type,
      campaign_name_pattern:
        form.match_type === "suffix_id" ? null : form.campaign_name_pattern.trim(),
      group_name_pattern: form.match_type === "suffix_id" ? null : form.group_name_pattern.trim() || null,
      av_line_item_code:
        form.match_type === "suffix_id" ? (form.av_line_item_code.trim() || null) : null,
      budget_split_pct: split,
      line_item_budget: budget,
      start_date: form.start_date,
      end_date: form.end_date,
      is_active: form.is_active,
      ...(!mapping ? { created_via: "manual" as const } : {}),
    }
    setSaving(true)
    try {
      if (mapping) {
        await updatePacingMapping(mapping.id, body)
      } else {
        await createPacingMapping(body)
      }
      toast({
        title: "Mapping saved",
        description: "Pacing data will refresh within a few seconds.",
      })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "Request failed",
      })
    } finally {
      setSaving(false)
    }
  }, [form, mapping, onOpenChange, onSaved, readOnlyExceptActive, toast, validateForSave])

  const clientComboboxOptions: ComboboxOption[] = useMemo(() => {
    let opts = clientOptions
    if (isScopedTenant) {
      const allow = new Set(assignedClientIds)
      opts = opts.filter((o) => allow.has(o.value))
    }
    return opts
  }, [assignedClientIds, clientOptions, isScopedTenant])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <SheetHeader className="space-y-1 border-b border-border/60 px-6 py-4 text-left">
          <SheetTitle>
            {readOnlyExceptActive
              ? "Pacing mapping (auto-synced)"
              : mapping
                ? "Edit pacing mapping"
                : "New pacing mapping"}
          </SheetTitle>
          <SheetDescription>
            Match production delivery to an AV line item. Preview matches before saving.
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-2">
          <ScrollArea className="h-[calc(100vh-8rem)] border-b border-border/60 md:h-auto md:border-b-0 md:border-r">
            <div className="space-y-4 p-6 pr-4">
              {!mapping && form.media_type === "search" ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Search mappings</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">
                    Search mappings are usually created automatically from your search containers. Use this form only
                    for manual overrides.{" "}
                    <Link
                      href="/pacing/settings#resync-search-mappings"
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      Resync search mappings
                    </Link>{" "}
                    in settings if delivery rules are out of date.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label>Client</Label>
                <Combobox
                  options={clientComboboxOptions}
                  value={form.clients_id}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      clients_id: v,
                      media_plan_id: "",
                      av_line_item_id: "",
                      av_line_item_label: "",
                    }))
                  }
                  placeholder="Select client"
                  disabled={!!mapping || readOnlyExceptActive}
                />
              </div>

              <div className="space-y-2">
                <Label>Media plan</Label>
                <Combobox
                  options={mediaPlanOptions}
                  value={form.media_plan_id}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      media_plan_id: v,
                      av_line_item_id: "",
                      av_line_item_label: "",
                    }))
                  }
                  placeholder={form.clients_id ? "Select media plan" : "Select a client first"}
                  disabled={!form.clients_id || readOnlyExceptActive}
                />
              </div>

              <div className="space-y-2">
                <Label>AV line item</Label>
                <Combobox
                  options={lineItemOptions}
                  value={form.av_line_item_id}
                  onValueChange={(v) => {
                    const row = lineItemRows.find((r) => r.av_line_item_id === v)
                    const label = row?.av_line_item_label?.trim() || v
                    setForm((f) => ({
                      ...f,
                      av_line_item_id: v,
                      av_line_item_label: label,
                    }))
                  }}
                  placeholder={
                    lineItemsLoading
                      ? "Loading line items..."
                      : form.media_plan_id
                        ? "Select line item"
                        : "Select a media plan first"
                  }
                  disabled={!form.media_plan_id || lineItemsLoading || readOnlyExceptActive}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Media type</Label>
                  <Combobox
                    options={mediaTypeComboboxOptions()}
                    value={form.media_type}
                    onValueChange={(v) => {
                      const nextPlats = platformComboboxOptionsForMediaType(v)
                      setForm((f) => ({
                        ...f,
                        media_type: v,
                        platform: nextPlats[0]?.value ?? "",
                        ...(!mapping ? { match_type: getDefaultMatchTypeForNewMapping(v) } : {}),
                      }))
                    }}
                    disabled={readOnlyExceptActive}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <Combobox
                    options={platformOpts}
                    value={form.platform}
                    onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}
                    disabled={readOnlyExceptActive}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Match type</Label>
                <RadioGroup
                  value={form.match_type}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      match_type: v as PacingMatchType,
                      ...(v === "suffix_id"
                        ? { campaign_name_pattern: "", group_name_pattern: "" }
                        : { av_line_item_code: "" }),
                    }))
                  }
                  className="flex flex-wrap gap-4 pt-1"
                >
                  {MATCH_TYPE_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-center gap-2">
                      <RadioGroupItem value={o.value} id={`mt-${o.value}`} disabled={readOnlyExceptActive} />
                      <Label htmlFor={`mt-${o.value}`} className="font-normal">
                        {o.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {form.match_type === "suffix_id" ? (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground font-medium">Line item code</Label>
                  <Input
                    value={form.av_line_item_code}
                    onChange={(e) => setForm((f) => ({ ...f, av_line_item_code: e.target.value }))}
                    placeholder="e.g. golf001se1"
                    disabled={readOnlyExceptActive}
                  />
                  <p className="text-xs text-muted-foreground">
                    The code that appears after the last hyphen in your ad group names, e.g. golf001se1 for an ad
                    group named &apos;Brand | Generic - golf001se1&apos;. Same value as the Search Line Item ID on each
                    search line in the media plan (the monospace code under &quot;Search Line Item&quot;).
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Campaign name pattern</Label>
                    <Input
                      value={form.campaign_name_pattern}
                      onChange={(e) => setForm((f) => ({ ...f, campaign_name_pattern: e.target.value }))}
                      placeholder="e.g. Brand_Search_AU"
                      disabled={readOnlyExceptActive}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Group name pattern (optional)</Label>
                    <Input
                      value={form.group_name_pattern}
                      onChange={(e) => setForm((f) => ({ ...f, group_name_pattern: e.target.value }))}
                      placeholder="Leave blank for campaign-level pacing"
                      disabled={readOnlyExceptActive}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to pace at the CAMPAIGN level (sums all ad groups and asset groups under matched
                      campaigns). Fill in to pace at the AD GROUP / ASSET GROUP level.
                    </p>
                    <div>
                      {form.group_name_pattern.trim() ? (
                        <Badge variant="secondary">Ad group / asset group-level pacing</Badge>
                      ) : (
                        <Badge variant="outline">Campaign-level pacing</Badge>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Budget split %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.budget_split_pct}
                    onChange={(e) => setForm((f) => ({ ...f, budget_split_pct: e.target.value }))}
                    disabled={readOnlyExceptActive}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Line item budget (AUD)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.line_item_budget}
                    onChange={(e) => setForm((f) => ({ ...f, line_item_budget: e.target.value }))}
                    disabled={readOnlyExceptActive}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    disabled={readOnlyExceptActive}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                    disabled={readOnlyExceptActive}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="map-active"
                  className="h-4 w-4 rounded border-input"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                <Label htmlFor="map-active" className="font-normal">
                  Active
                </Label>
              </div>
            </div>
          </ScrollArea>

          <div className="flex min-h-0 flex-col bg-muted/25">
            <div className="border-b border-border/60 px-6 py-3">
              <p className="text-sm font-medium">Test match preview</p>
              <p className="text-xs text-muted-foreground">
                Live preview from Snowflake (debounced). Patterns apply to the selected platform and date range.
              </p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-6 pt-4">
                {previewLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : previewError ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {previewError}
                  </div>
                ) : (form.match_type === "suffix_id"
                  ? !form.av_line_item_code.trim()
                  : !form.campaign_name_pattern.trim()) ? (
                  <p className="text-sm text-muted-foreground">
                    {form.match_type === "suffix_id"
                      ? "Enter a line item code to preview matches."
                      : "Enter a campaign pattern to preview matches."}
                  </p>
                ) : previewRows.length === 0 ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    No campaigns or groups matched. Check your pattern.
                  </div>
                ) : (
                  <>
                    <p className="text-sm">
                      <span className="font-medium">{previewMatchCount}</span> matched
                      {previewMatchCount >= 50 ? " (showing first 50)" : ""}
                    </p>
                    <div className="space-y-2">
                      {groupedPreview.map(([campaign, rows]) => (
                        <Collapsible key={campaign} defaultOpen className="rounded-md border border-border/60 bg-background">
                          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50">
                            <span className="truncate">{campaign}</span>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              {rows.length} <ChevronsUpDown className="h-3 w-3" />
                            </span>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <ul className="space-y-1 border-t border-border/50 px-3 py-2 text-xs">
                              {rows.map((r, i) => (
                                <li key={`${r.campaign_name}-${r.group_name}-${i}`} className="tabular-nums">
                                  <span className="text-muted-foreground">{r.group_type ?? "—"}</span>
                                  <span className="mx-1">·</span>
                                  <span>{r.group_name ?? "—"}</span>
                                </li>
                              ))}
                            </ul>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <SheetFooter className="border-t border-border/60 px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={saving}>
            {saving ? "Saving…" : "Save mapping"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
