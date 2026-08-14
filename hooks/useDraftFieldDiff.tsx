"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"

import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"
import {
  formatDraftFieldWas,
  getValueAtPath,
  inferDraftFieldKind,
  isDraftFieldChanged,
  isDraftLineNew,
  type DraftFieldKind,
} from "@/lib/mediaplan/drafts/fieldDiff"

export type DraftDiffContextValue = {
  base: PlanDraftStateV1
}

const DraftDiffContext = createContext<DraftDiffContextValue | null>(null)

export function DraftDiffProvider(props: {
  base: PlanDraftStateV1 | null
  children: ReactNode
}) {
  const value = useMemo(
    () => (props.base ? { base: props.base } : null),
    [props.base],
  )
  if (!value) return props.children
  return (
    <DraftDiffContext.Provider value={value}>
      {props.children}
    </DraftDiffContext.Provider>
  )
}

export function useDraftDiffActive(): boolean {
  return useContext(DraftDiffContext) != null
}

export function useDraftLineMeta(lineItemId: string): { isNew: boolean } {
  const ctx = useContext(DraftDiffContext)
  return useMemo(() => {
    if (!ctx || !lineItemId) return { isNew: false }
    return { isNew: isDraftLineNew(ctx.base, lineItemId) }
  }, [ctx, lineItemId])
}

export function useDraftFieldDiff(
  lineItemId: string,
  fieldPath: string,
  currentValue: unknown,
  kind?: DraftFieldKind,
): { changed: boolean; wasFormatted: string; isNewLine: boolean } {
  const ctx = useContext(DraftDiffContext)
  return useMemo(() => {
    if (!ctx || !lineItemId || !fieldPath) {
      return { changed: false, wasFormatted: "", isNewLine: false }
    }
    const isNewLine = isDraftLineNew(ctx.base, lineItemId)
    if (isNewLine) {
      return { changed: false, wasFormatted: "", isNewLine: true }
    }
    const resolvedKind = kind ?? inferDraftFieldKind(fieldPath)
    const changed = isDraftFieldChanged(ctx.base, lineItemId, fieldPath, currentValue)
    if (!changed) return { changed: false, wasFormatted: "", isNewLine: false }
    const row = Object.values(ctx.base.channels)
      .flat()
      .find((item) => {
        const r = item as { line_item_id?: string; lineItemId?: string }
        return String(r.line_item_id ?? r.lineItemId ?? "") === lineItemId
      })
    const oldValue = getValueAtPath(row, fieldPath)
    return {
      changed: true,
      wasFormatted: formatDraftFieldWas(oldValue, resolvedKind),
      isNewLine: false,
    }
  }, [ctx, lineItemId, fieldPath, currentValue, kind])
}
