"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Cell,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { format, parse, parseISO } from "date-fns"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format/money"
import { rgbaFromHex } from "@/lib/mediaplan/mediaTypeAccents"
import type { BillingRecord, BillingStatus } from "@/lib/types/financeBilling"
import { publisherLabelForFinanceGrouping } from "@/lib/finance/aggregatePayablesPublisherGroups"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { useToast } from "@/components/ui/use-toast"

const FINANCE_GRID_INFO_HEX = "#4ac7eb"

const financeGridHeaderCellStyle = {
  backgroundColor: rgbaFromHex(FINANCE_GRID_INFO_HEX, 0.08),
}

const HEADER_TH_CLASS = cn(
  "sticky top-0 z-[21] border-b border-r px-1.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))] backdrop-blur-sm"
)

const BODY_TD_CLASS =
  "border-b border-r bg-inherit px-1 py-0.5 align-middle text-xs"

const DATA_ROW_HEIGHT = 36
const GROUP_ROW_HEIGHT = 30
const DETAIL_ROW_HEIGHT = 320

const ALL_BILLING_STATUSES: BillingStatus[] = [
  "draft",
  "booked",
  "approved",
  "invoiced",
  "paid",
  "cancelled",
  "expected",
  "disputed",
]

const BILLING_STATUS_COMBO_OPTIONS: ComboboxOption[] = ALL_BILLING_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

export type FinanceColumnMeta = {
  /** Explicit data field on BillingRecord (defaults to accessorKey / id). */
  field?: string
  kind?: "text" | "currency" | "date" | "status" | "number"
}

type FlatItem =
  | { type: "group"; key: string; label: string; depth?: number }
  | { type: "record"; record: BillingRecord; sourceIndex: number }
  | { type: "detail"; record: BillingRecord }

export type EditableFinanceGridProps = {
  columns: ColumnDef<BillingRecord, unknown>[]
  records: BillingRecord[]
  onCellEdit: (recordId: number, field: string, value: unknown) => Promise<void>
  groupBy?: "client" | "publisher" | "publisher_client" | "month_client" | "none"
  editableFields: string[]
  /** When set, row detail panels are inserted after expanded record rows. */
  expandedRecordIds?: ReadonlySet<number>
  renderDetailRow?: (record: BillingRecord) => ReactNode
  /** Override status combobox options (default: all BillingStatus values). */
  statusComboboxOptions?: ComboboxOption[]
  /** When false, skip zustand `billingRecords` optimistic updates (e.g. payables-only data). Default true. */
  enableStoreOptimisticSync?: boolean
  /** Hide Discard / Publish footer (hub can own publish). Default false. */
  hideFooter?: boolean
  /** Sort rows inside each top-level group (client / publisher). */
  compareRecordsInGroup?: (a: BillingRecord, b: BillingRecord) => number
  /** Click a data row (ignored when target is interactive). */
  onDataRowClick?: (record: BillingRecord) => void
  /** Extra row classes (e.g. accrual subtotals). */
  getRecordRowClassName?: (record: BillingRecord) => string | undefined
}

function columnField(col: { columnDef: ColumnDef<BillingRecord, unknown>; id: string }): string {
  const meta = (col.columnDef.meta as { finance?: FinanceColumnMeta } | undefined)?.finance
  if (meta?.field) return meta.field
  const def = col.columnDef as { accessorKey?: keyof BillingRecord & string }
  if (def.accessorKey) return String(def.accessorKey)
  return col.id
}

function inferCellKind(field: string, meta?: FinanceColumnMeta): FinanceColumnMeta["kind"] {
  if (meta?.kind) return meta.kind
  if (field === "status") return "status"
  if (field === "invoice_date" || field.endsWith("_date")) return "date"
  if (field === "total") return "currency"
  if (field === "payment_days") return "number"
  return "text"
}

/** Strip currency symbols, commas, whitespace; parse number. */
export function normalizeFinanceNumericPaste(raw: string): number | null {
  const t = raw.replace(/[\s$,€£¥]/g, "").trim()
  if (t === "" || t === "-" || t === ".") return null
  const n = Number.parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function getRecordValue(record: BillingRecord, field: string): unknown {
  return (record as unknown as Record<string, unknown>)[field]
}

function appendRecordWithOptionalDetail(
  out: FlatItem[],
  record: BillingRecord,
  sourceIndex: number,
  expandedRecordIds: ReadonlySet<number> | undefined,
  hasDetailRenderer: boolean
) {
  out.push({ type: "record", record, sourceIndex })
  if (hasDetailRenderer && expandedRecordIds?.has(record.id)) {
    out.push({ type: "detail", record })
  }
}

function buildFlatItems(
  records: BillingRecord[],
  groupBy: EditableFinanceGridProps["groupBy"],
  expandedRecordIds: ReadonlySet<number> | undefined,
  hasDetailRenderer: boolean,
  compareRecordsInGroup?: (a: BillingRecord, b: BillingRecord) => number
): FlatItem[] {
  if (!groupBy || groupBy === "none") {
    const out: FlatItem[] = []
    records.forEach((record, sourceIndex) => {
      appendRecordWithOptionalDetail(out, record, sourceIndex, expandedRecordIds, hasDetailRenderer)
    })
    return out
  }

  const indexById = new Map<number, number>()
  records.forEach((r, i) => indexById.set(r.id, i))

  if (groupBy === "month_client") {
    const byMonth = new Map<string, BillingRecord[]>()
    for (const r of records) {
      const mo = r.billing_month?.trim() || "—"
      if (!byMonth.has(mo)) byMonth.set(mo, [])
      byMonth.get(mo)!.push(r)
    }
    const months = [...byMonth.keys()].sort()
    const out: FlatItem[] = []
    for (const month of months) {
      const monthLabel =
        month && month !== "—"
          ? (() => {
              try {
                return format(parse(month, "yyyy-MM", new Date()), "MMMM yyyy")
              } catch {
                return month
              }
            })()
          : month
      out.push({ type: "group", key: `m:${month}`, label: monthLabel, depth: 0 })
      const monthRows = byMonth.get(month) ?? []
      const byClient = new Map<string, BillingRecord[]>()
      for (const r of monthRows) {
        const c = r.client_name?.trim() || "—"
        if (!byClient.has(c)) byClient.set(c, [])
        byClient.get(c)!.push(r)
      }
      const clients = [...byClient.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      for (const client of clients) {
        out.push({ type: "group", key: `m:${month}|c:${client}`, label: client, depth: 1 })
        const list = (byClient.get(client) ?? [])
          .slice()
          .sort(
            compareRecordsInGroup ??
              ((a, b) =>
                (a.campaign_name || "").localeCompare(b.campaign_name || "", undefined, {
                  sensitivity: "base",
                }))
          )
        for (const record of list) {
          appendRecordWithOptionalDetail(
            out,
            record,
            indexById.get(record.id) ?? 0,
            expandedRecordIds,
            hasDetailRenderer
          )
        }
      }
    }
    return out
  }

  if (groupBy === "publisher_client") {
    const byPub = new Map<string, BillingRecord[]>()
    for (const r of records) {
      const p = publisherLabelForFinanceGrouping(r)
      if (!byPub.has(p)) byPub.set(p, [])
      byPub.get(p)!.push(r)
    }
    const pubs = [...byPub.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    const out: FlatItem[] = []
    for (const pub of pubs) {
      out.push({ type: "group", key: `p:${pub}`, label: pub, depth: 0 })
      const pubRows = byPub.get(pub) ?? []
      const byClient = new Map<string, BillingRecord[]>()
      for (const r of pubRows) {
        const c = r.client_name?.trim() || "—"
        if (!byClient.has(c)) byClient.set(c, [])
        byClient.get(c)!.push(r)
      }
      const clients = [...byClient.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      for (const client of clients) {
        out.push({ type: "group", key: `p:${pub}|c:${client}`, label: client, depth: 1 })
        const list = (byClient.get(client) ?? [])
          .slice()
          .sort(
            compareRecordsInGroup ??
              ((a, b) => {
                const ma = (a.mba_number || "").toLowerCase()
                const mb = (b.mba_number || "").toLowerCase()
                if (ma !== mb) return ma.localeCompare(mb)
                return (a.campaign_name || "").localeCompare(b.campaign_name || "", undefined, {
                  sensitivity: "base",
                })
              })
          )
        for (const record of list) {
          appendRecordWithOptionalDetail(
            out,
            record,
            indexById.get(record.id) ?? 0,
            expandedRecordIds,
            hasDetailRenderer
          )
        }
      }
    }
    return out
  }

  const keyFn =
    groupBy === "client"
      ? (r: BillingRecord) => r.client_name?.trim() || "—"
      : (r: BillingRecord) => publisherLabelForFinanceGrouping(r)

  const map = new Map<string, BillingRecord[]>()
  for (const r of records) {
    const k = keyFn(r)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }

  const keys = [...map.keys()].sort((a, b) => a.localeCompare(b))
  const out: FlatItem[] = []
  const defaultGroupSort = (a: BillingRecord, b: BillingRecord) =>
    (a.campaign_name || "").localeCompare(b.campaign_name || "")
  for (const key of keys) {
    out.push({ type: "group", key, label: key })
    const list = map.get(key) ?? []
    list.sort(compareRecordsInGroup ?? defaultGroupSort)
    for (const record of list) {
      appendRecordWithOptionalDetail(
        out,
        record,
        indexById.get(record.id) ?? 0,
        expandedRecordIds,
        hasDetailRenderer
      )
    }
  }
  return out
}

function financeGridCellId(gridDomId: string, flatIndex: number, colIndex: number) {
  return `finance-grid-${gridDomId}-${flatIndex}-${colIndex}`
}

export function EditableFinanceGrid({
  columns,
  records,
  onCellEdit,
  groupBy = "none",
  editableFields,
  expandedRecordIds,
  renderDetailRow,
  statusComboboxOptions,
  enableStoreOptimisticSync = true,
  hideFooter = false,
  compareRecordsInGroup,
  onDataRowClick,
  getRecordRowClassName,
}: EditableFinanceGridProps) {
  const domGridId = useId().replace(/:/g, "")
  const { toast } = useToast()
  const fetchBilling = useFinanceStore((s) => s.fetchBilling)
  const refreshPendingDraftCount = useFinanceStore((s) => s.refreshPendingDraftCount)
  const updateBillingRecord = useFinanceStore((s) => s.updateBillingRecord)

  const hasDetailRenderer = typeof renderDetailRow === "function"
  const flatItems = useMemo(
    () => buildFlatItems(records, groupBy, expandedRecordIds, hasDetailRenderer, compareRecordsInGroup),
    [records, groupBy, expandedRecordIds, hasDetailRenderer, compareRecordsInGroup]
  )

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const rowById = useMemo(() => {
    const m = new Map<number, Row<BillingRecord>>()
    for (const row of table.getRowModel().rows) {
      m.set(row.index, row)
    }
    return m
  }, [table, records, columns])

  const leafColumns = table.getVisibleLeafColumns()

  const [focusFlat, setFocusFlat] = useState<{ flat: number; col: number } | null>(null)
  const [editTarget, setEditTarget] = useState<{ flat: number; col: number } | null>(null)
  const [localDirtyIds, setLocalDirtyIds] = useState<Set<number>>(() => new Set())

  const parentRef = useRef<HTMLDivElement>(null)
  const focusInitRef = useRef(false)

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const it = flatItems[i]
      if (!it) return DATA_ROW_HEIGHT
      if (it.type === "group") return GROUP_ROW_HEIGHT
      if (it.type === "detail") return DETAIL_ROW_HEIGHT
      return DATA_ROW_HEIGHT
    },
    overscan: 10,
  })

  const recordFlatIndexList = useMemo(() => {
    const list: number[] = []
    flatItems.forEach((it, i) => {
      if (it.type === "record") list.push(i)
    })
    return list
  }, [flatItems])

  const draftBadgeColumnIndex = Math.max(
    0,
    leafColumns.findIndex((c) => c.id !== "__expand__")
  )

  const draftRowCount = useMemo(() => {
    const ids = new Set<number>()
    for (const r of records) {
      if (r.has_pending_edits || localDirtyIds.has(r.id)) ids.add(r.id)
    }
    return ids.size
  }, [records, localDirtyIds])

  const isRowDraft = useCallback(
    (record: BillingRecord) => record.has_pending_edits || localDirtyIds.has(record.id),
    [localDirtyIds]
  )

  const moveFocus = useCallback(
    (nextFlat: number, nextCol: number) => {
      if (leafColumns.length === 0) return
      const col = Math.max(0, Math.min(leafColumns.length - 1, nextCol))
      setFocusFlat({ flat: nextFlat, col })
      setEditTarget(null)
      requestAnimationFrame(() => {
        const el = document.getElementById(financeGridCellId(domGridId, nextFlat, col))
        el?.focus()
      })
    },
    [domGridId, leafColumns.length]
  )

  const nextRecordFlatIndex = useCallback(
    (fromFlat: number, delta: number): number | null => {
      const pos = recordFlatIndexList.indexOf(fromFlat)
      if (pos < 0) return recordFlatIndexList[0] ?? null
      const n = pos + delta
      if (n < 0 || n >= recordFlatIndexList.length) return null
      return recordFlatIndexList[n]!
    },
    [recordFlatIndexList]
  )

  const commitField = useCallback(
    async (record: BillingRecord, field: string, value: unknown, kind: FinanceColumnMeta["kind"]) => {
      const prev = { ...record }
      setLocalDirtyIds((s) => {
        const n = new Set(s)
        n.add(record.id)
        return n
      })
      if (enableStoreOptimisticSync) {
        updateBillingRecord(record.id, { [field]: value } as Partial<BillingRecord>)
      }

      try {
        await onCellEdit(record.id, field, value)
        setLocalDirtyIds((s) => {
          const n = new Set(s)
          n.delete(record.id)
          return n
        })
        if (enableStoreOptimisticSync) {
          updateBillingRecord(record.id, { has_pending_edits: true } as Partial<BillingRecord>)
        }
      } catch (e) {
        if (enableStoreOptimisticSync) {
          updateBillingRecord(record.id, prev as Partial<BillingRecord>)
        }
        setLocalDirtyIds((s) => {
          const n = new Set(s)
          n.delete(record.id)
          return n
        })
        toast({
          variant: "destructive",
          title: "Could not save",
          description: e instanceof Error ? e.message : "Update failed",
        })
      }
    },
    [enableStoreOptimisticSync, onCellEdit, toast, updateBillingRecord]
  )

  const handleDiscardDrafts = useCallback(async () => {
    setLocalDirtyIds(new Set())
    setEditTarget(null)
    await fetchBilling()
    await refreshPendingDraftCount()
    toast({ title: "Discarded", description: "Reloaded billing rows from the server." })
  }, [fetchBilling, refreshPendingDraftCount, toast])

  const handlePublish = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/edits/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }
      setLocalDirtyIds(new Set())
      await fetchBilling()
      await refreshPendingDraftCount()
      toast({ title: "Published", description: "Finance edits publish completed." })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Publish failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }, [fetchBilling, refreshPendingDraftCount, toast])

  const onPasteCapture = useCallback(
    (e: React.ClipboardEvent) => {
      if (!focusFlat) return
      const item = flatItems[focusFlat.flat]
      if (!item || item.type !== "record") return
      const col = leafColumns[focusFlat.col]
      if (!col) return
      const field = columnField(col)
      if (!editableFields.includes(field)) return

      const text = e.clipboardData.getData("text/plain")
      if (!text) return
      e.preventDefault()

      const meta = (col.columnDef.meta as { finance?: FinanceColumnMeta } | undefined)?.finance
      const kind = inferCellKind(field, meta)

      if (kind === "currency" || kind === "number") {
        const n = normalizeFinanceNumericPaste(text)
        if (n === null) {
          toast({
            variant: "destructive",
            title: "Invalid paste",
            description: "That cell only accepts numbers.",
          })
          return
        }
        void commitField(item.record, field, n, kind)
        return
      }

      if (kind === "status") {
        const raw = text.trim().toLowerCase()
        const allowed = (statusComboboxOptions ?? BILLING_STATUS_COMBO_OPTIONS).map((o) => o.value)
        const match = allowed.find((s) => String(s).toLowerCase() === raw)
        if (!match) {
          toast({
            variant: "destructive",
            title: "Invalid status",
            description: `Use one of: ${allowed.join(", ")}`,
          })
          return
        }
        void commitField(item.record, field, match, kind)
        return
      }

      if (kind === "date") {
        const t = text.trim()
        try {
          const d = parseISO(t)
          if (Number.isNaN(d.getTime())) throw new Error("bad")
          void commitField(item.record, field, format(d, "yyyy-MM-dd"), kind)
        } catch {
          toast({
            variant: "destructive",
            title: "Invalid date",
            description: "Paste a YYYY-MM-DD or ISO date.",
          })
        }
        return
      }

      void commitField(item.record, field, text.trim(), kind)
    },
    [commitField, editableFields, flatItems, focusFlat, leafColumns, statusComboboxOptions, toast]
  )

  const handleGridNavKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (leafColumns.length === 0) return
      const fc = focusFlat
      if (!fc) return

      const item = flatItems[fc.flat]
      if (!item || item.type !== "record") return

      const col = leafColumns[fc.col]
      if (!col) return
      const field = columnField(col)
      const editable = editableFields.includes(field)
      const meta = (col.columnDef.meta as { finance?: FinanceColumnMeta } | undefined)?.finance
      const kind = inferCellKind(field, meta)

      const isEditingHere =
        editTarget && editTarget.flat === fc.flat && editTarget.col === fc.col

      if (e.key === "Enter") {
        if (!editable) return
        if (!isEditingHere) {
          e.preventDefault()
          setEditTarget({ flat: fc.flat, col: fc.col })
          return
        }
      }

      if (e.key === "Tab" && isEditingHere) {
        const id = financeGridCellId(domGridId, fc.flat, fc.col)
        const active = document.activeElement
        if (active instanceof HTMLInputElement && active.id === id) {
          e.preventDefault()
          const meta = (col.columnDef.meta as { finance?: FinanceColumnMeta } | undefined)?.finance
          const k = inferCellKind(field, meta)
          if (k === "currency" || k === "number") {
            const n = normalizeFinanceNumericPaste(active.value)
            if (n === null && active.value.trim() !== "") {
              toast({
                variant: "destructive",
                title: "Invalid number",
                description: "Enter a number before leaving the cell.",
              })
              return
            }
            if (n !== null) void commitField(item.record, field, n, k)
          } else if (k === "text") {
            void commitField(item.record, field, active.value, k)
          }
          setEditTarget(null)
          if (e.shiftKey) {
            if (fc.col > 0) moveFocus(fc.flat, fc.col - 1)
            else {
              const nf = nextRecordFlatIndex(fc.flat, -1)
              if (nf !== null) moveFocus(nf, leafColumns.length - 1)
            }
          } else if (fc.col < leafColumns.length - 1) moveFocus(fc.flat, fc.col + 1)
          else {
            const nf = nextRecordFlatIndex(fc.flat, 1)
            if (nf !== null) moveFocus(nf, 0)
          }
          return
        }
      }

      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
        isEditingHere
      ) {
        const t = e.target as HTMLElement
        if (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "date") {
          const inp = t as HTMLInputElement
          const len = inp.value.length
          const ss = inp.selectionStart ?? 0
          const se = inp.selectionEnd ?? 0
          if (e.key === "ArrowLeft" && (ss !== 0 || se !== 0)) return
          if (e.key === "ArrowRight" && (ss !== len || se !== len)) return
        }
      }

      if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault()
        if (fc.col < leafColumns.length - 1) moveFocus(fc.flat, fc.col + 1)
        else {
          const nf = nextRecordFlatIndex(fc.flat, 1)
          if (nf !== null) moveFocus(nf, 0)
        }
        return
      }

      if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault()
        if (fc.col > 0) moveFocus(fc.flat, fc.col - 1)
        else {
          const nf = nextRecordFlatIndex(fc.flat, -1)
          if (nf !== null) moveFocus(nf, leafColumns.length - 1)
        }
        return
      }

      if (e.key === "ArrowDown") {
        if (isEditingHere) {
          const t = e.target as HTMLElement
          if (t.tagName === "INPUT") {
            e.preventDefault()
            ;(t as HTMLInputElement).blur()
          }
        } else e.preventDefault()
        const nf = nextRecordFlatIndex(fc.flat, 1)
        if (nf !== null) moveFocus(nf, fc.col)
        return
      }

      if (e.key === "ArrowUp") {
        if (isEditingHere) {
          const t = e.target as HTMLElement
          if (t.tagName === "INPUT") {
            e.preventDefault()
            ;(t as HTMLInputElement).blur()
          }
        } else e.preventDefault()
        const nf = nextRecordFlatIndex(fc.flat, -1)
        if (nf !== null) moveFocus(nf, fc.col)
        return
      }
    },
    [
      commitField,
      domGridId,
      editableFields,
      editTarget,
      flatItems,
      focusFlat,
      leafColumns,
      moveFocus,
      nextRecordFlatIndex,
      toast,
    ]
  )

  useEffect(() => {
    if (recordFlatIndexList.length === 0) {
      focusInitRef.current = false
      return
    }
    if (focusInitRef.current) return
    focusInitRef.current = true
    const first = recordFlatIndexList[0]!
    setFocusFlat({ flat: first, col: 0 })
  }, [recordFlatIndexList])

  useEffect(() => {
    if (!editTarget) return
    const col = leafColumns[editTarget.col]
    if (!col) return
    const field = columnField(col)
    const meta = (col.columnDef.meta as { finance?: FinanceColumnMeta } | undefined)?.finance
    const kind = inferCellKind(field, meta)
    if (kind === "status" || kind === "date") return
    const id = financeGridCellId(domGridId, editTarget.flat, editTarget.col)
    requestAnimationFrame(() => {
      document.getElementById(id)?.focus()
    })
  }, [editTarget, domGridId, leafColumns])

  const virtualItems = rowVirtualizer.getVirtualItems()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0

  const colCount = leafColumns.length

  const renderBodyCell = (
    cell: Cell<BillingRecord, unknown>,
    ctx: {
      flatIndex: number
      colIndex: number
      record: BillingRecord
      showDraft: boolean
      stripeClass: string
      stripeStyle: CSSProperties | undefined
    }
  ) => {
    const { flatIndex, colIndex, record, showDraft, stripeClass, stripeStyle } = ctx
    const field = columnField(cell.column)
    const editable = editableFields.includes(field)
    const meta = (cell.column.columnDef.meta as { finance?: FinanceColumnMeta } | undefined)?.finance
    const kind = inferCellKind(field, meta)
    const value = getRecordValue(record, field)
    const isFocused = focusFlat?.flat === flatIndex && focusFlat?.col === colIndex
    const isEditing =
      editTarget?.flat === flatIndex && editTarget?.col === colIndex && editable

    const cellId = financeGridCellId(domGridId, flatIndex, colIndex)

    const startEdit = () => {
      if (!editable) return
      setFocusFlat({ flat: flatIndex, col: colIndex })
      setEditTarget({ flat: flatIndex, col: colIndex })
    }

    const commitAndMoveDown = async (nextValue: unknown) => {
      setEditTarget(null)
      await commitField(record, field, nextValue, kind)
      const nf = nextRecordFlatIndex(flatIndex, 1)
      if (nf !== null) moveFocus(nf, colIndex)
    }

    const onDisplayKeyDown = (e: ReactKeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        startEdit()
      }
    }

    let inner: ReactNode

    if (!editable) {
      const CellComp = cell.column.columnDef.cell
      inner = CellComp ? flexRender(CellComp, cell.getContext()) : String(cell.getValue() ?? "")
    } else if (isEditing) {
      if (kind === "status") {
        inner = (
          <Combobox
            id={cellId}
            options={statusComboboxOptions ?? BILLING_STATUS_COMBO_OPTIONS}
            value={String(value ?? "")}
            onValueChange={(v) => void commitAndMoveDown(v as BillingStatus)}
            placeholder="Status"
            searchPlaceholder="Search status…"
            buttonClassName="h-8 w-full border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
            onOpenChange={(open) => {
              if (!open) setEditTarget(null)
            }}
          />
        )
      } else if (kind === "date") {
        const d =
          value && typeof value === "string"
            ? parseISO(value)
            : value instanceof Date
              ? value
              : null
        inner = (
          <SingleDatePicker
            id={cellId}
            value={d && !Number.isNaN(d.getTime()) ? d : null}
            onChange={(next) => {
              if (!next) {
                void commitAndMoveDown(null)
                return
              }
              void commitAndMoveDown(format(next, "yyyy-MM-dd"))
            }}
            className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
            dateFormat="yyyy-MM-dd"
            placeholder={<span className="text-muted-foreground">Pick date</span>}
          />
        )
      } else if (kind === "currency") {
        inner = (
          <div className="flex h-8 min-w-0 items-center gap-0.5 tabular-nums">
            <span className="shrink-0 text-muted-foreground" aria-hidden>
              $
            </span>
            <Input
              key={`${record.id}-${field}-${String(value)}`}
              id={cellId}
              className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0.5 text-xs shadow-none focus-visible:ring-1 tabular-nums"
              defaultValue={value === null || value === undefined ? "" : String(value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  const n = normalizeFinanceNumericPaste((e.target as HTMLInputElement).value)
                  if (n === null) {
                    toast({
                      variant: "destructive",
                      title: "Invalid number",
                      description: "Enter a numeric amount.",
                    })
                    return
                  }
                  void commitAndMoveDown(n)
                }
              }}
              onBlur={(e) => {
                const n = normalizeFinanceNumericPaste(e.target.value)
                if (n === null && e.target.value.trim() !== "") {
                  toast({
                    variant: "destructive",
                    title: "Invalid number",
                    description: "Enter a numeric amount.",
                  })
                  return
                }
                if (n !== null) void commitField(record, field, n, kind)
                setEditTarget(null)
              }}
            />
          </div>
        )
      } else if (kind === "number") {
        inner = (
          <Input
            key={`${record.id}-${field}-${String(value)}`}
            id={cellId}
            type="text"
            inputMode="numeric"
            className="h-8 border-0 bg-transparent px-1 text-xs tabular-nums shadow-none focus-visible:ring-1"
            defaultValue={value === null || value === undefined ? "" : String(value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                const n = normalizeFinanceNumericPaste((e.target as HTMLInputElement).value)
                if (n === null) {
                  toast({
                    variant: "destructive",
                    title: "Invalid number",
                    description: "Enter a number.",
                  })
                  return
                }
                void commitAndMoveDown(n)
              }
            }}
            onBlur={(e) => {
              const n = normalizeFinanceNumericPaste(e.target.value)
              if (n === null && e.target.value.trim() !== "") {
                toast({
                  variant: "destructive",
                  title: "Invalid number",
                  description: "Enter a number.",
                })
                return
              }
              if (n !== null) void commitField(record, field, n, kind)
              setEditTarget(null)
            }}
          />
        )
      } else {
        inner = (
          <Input
            key={`${record.id}-${field}-${String(value)}`}
            id={cellId}
            className="h-8 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
            defaultValue={value === null || value === undefined ? "" : String(value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void commitAndMoveDown((e.target as HTMLInputElement).value)
              }
            }}
            onBlur={(e) => {
              void commitField(record, field, e.target.value, kind)
              setEditTarget(null)
            }}
          />
        )
      }
    } else {
      let display = ""
      if (kind === "currency") {
        const num = typeof value === "number" ? value : Number(value)
        display = Number.isFinite(num) ? formatMoney(num) : ""
      } else if (kind === "number") {
        display = value === null || value === undefined ? "" : String(value)
      } else if (kind === "date" && value && typeof value === "string") {
        try {
          display = format(parseISO(value), "yyyy-MM-dd")
        } catch {
          display = String(value)
        }
      } else {
        display = value === null || value === undefined ? "" : String(value)
      }

      inner = (
        <div
          id={cellId}
          role="button"
          tabIndex={0}
          className={cn(
            "flex min-h-8 cursor-default items-center rounded-sm px-1 text-xs outline-none",
            editable && "cursor-pointer hover:bg-muted/40",
            isFocused && "ring-1 ring-ring"
          )}
          onDoubleClick={startEdit}
          onKeyDown={onDisplayKeyDown}
          onFocus={() => setFocusFlat({ flat: flatIndex, col: colIndex })}
        >
          <span className={cn(kind === "currency" && "tabular-nums")}>{display}</span>
        </div>
      )
    }

    const showDraftBadgeHere = colIndex === draftBadgeColumnIndex

    return (
      <td
        key={cell.id}
        className={cn(BODY_TD_CLASS, stripeClass, "relative")}
        style={stripeStyle}
        data-field={field}
      >
        {showDraftBadgeHere && showDraft ? (
          <Badge
            variant="secondary"
            className="absolute left-0.5 top-1/2 z-[1] -translate-y-1/2 px-1 py-0 text-[10px] font-medium uppercase tracking-wide"
          >
            draft
          </Badge>
        ) : null}
        <div className={cn(showDraftBadgeHere && showDraft && "pl-12")}>{inner}</div>
      </td>
    )
  }

  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-lg border border-border/80 bg-card/30 shadow-sm"
        onKeyDownCapture={handleGridNavKeyDown}
        onPasteCapture={onPasteCapture}
      >
        <div
          ref={parentRef}
          className="relative max-h-[min(70vh,900px)] min-h-[320px] min-w-0 overflow-auto overscroll-contain scroll-smooth [scrollbar-gutter:stable]"
        >
          <table className="w-max min-w-full border-collapse text-sm">
            <thead className="[&_tr]:border-b-0">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={HEADER_TH_CLASS}
                      style={financeGridHeaderCellStyle}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {paddingTop > 0 ? (
                <tr aria-hidden style={{ height: paddingTop }}>
                  <td
                    colSpan={Math.max(1, colCount)}
                    style={{ height: paddingTop, padding: 0, border: 0 }}
                  />
                </tr>
              ) : null}
              {virtualItems.map((vi) => {
                const item = flatItems[vi.index]
                if (!item) return null
                if (item.type === "group") {
                  const depth = item.depth ?? 0
                  return (
                    <tr
                      key={`g-${item.key}-${vi.index}`}
                      style={{ height: vi.size }}
                      className={cn("bg-muted/30", depth > 0 && "bg-muted/15")}
                    >
                      <td
                        colSpan={Math.max(1, colCount)}
                        className="border-b border-border/60 py-1 text-xs font-semibold text-muted-foreground"
                        style={{ paddingLeft: 8 + depth * 16 }}
                      >
                        {item.label}
                      </td>
                    </tr>
                  )
                }

                if (item.type === "detail") {
                  return (
                    <tr
                      key={`d-${item.record.id}-${vi.index}`}
                      style={{ height: vi.size }}
                      className="bg-muted/5"
                    >
                      <td
                        colSpan={Math.max(1, colCount)}
                        className="border-b border-r p-2 align-top"
                      >
                        {renderDetailRow?.(item.record)}
                      </td>
                    </tr>
                  )
                }

                const record = item.record
                const row = rowById.get(item.sourceIndex)
                if (!row) return null

                const flatIndex = vi.index
                const showDraft = isRowDraft(record)
                const stripeClass = flatIndex % 2 === 1 ? "bg-muted/10" : ""
                const stripeStyle =
                  flatIndex % 2 === 0
                    ? { backgroundColor: rgbaFromHex(FINANCE_GRID_INFO_HEX, 0.03) }
                    : undefined

                return (
                  <tr
                    key={`r-${record.id}-${vi.index}`}
                    style={{ height: vi.size }}
                    className={cn(
                      "transition-colors hover:bg-muted/35 focus-within:bg-muted/35",
                      showDraft && "border-l-2 border-info",
                      onDataRowClick && "cursor-pointer",
                      getRecordRowClassName?.(record)
                    )}
                    data-record-id={record.id}
                    onClick={(e) => {
                      if (!onDataRowClick) return
                      const el = e.target as HTMLElement
                      if (el.closest("button, input, textarea, a, [data-no-row-click], [role='combobox']"))
                        return
                      onDataRowClick(record)
                    }}
                  >
                    {row.getVisibleCells().map((cell, colIndex) =>
                      renderBodyCell(cell, {
                        flatIndex,
                        colIndex,
                        record,
                        showDraft,
                        stripeClass,
                        stripeStyle,
                      })
                    )}
                  </tr>
                )
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden style={{ height: paddingBottom }}>
                  <td
                    colSpan={Math.max(1, colCount)}
                    style={{ height: paddingBottom, padding: 0, border: 0 }}
                  />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {!hideFooter ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => void handleDiscardDrafts()}>
            Discard drafts
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={draftRowCount === 0}
            onClick={() => void handlePublish()}
          >
            Publish ({draftRowCount})
          </Button>
        </div>
      ) : null}
    </div>
  )
}
