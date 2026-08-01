/**
 * PC7 — plan save pill + draft helpers.
 * Pill text is driven by the SAME `resolvePostgresSaveMode` mapping as T4c.
 */

import type { ResolvePostgresSaveModeResult } from "@/lib/mediaplan/resolvePostgresSaveMode"

export type PlanSavePill = {
  primary: string
  secondary: string | null
}

export function describePlanSavePill(args: {
  modeResolved: ResolvePostgresSaveModeResult
  hasWorkingDraft: boolean
  autosavedSecondsAgo: number | null
  editingUnpublishedDraft: boolean
}): PlanSavePill {
  const { modeResolved: m } = args
  let primary: string
  if (args.editingUnpublishedDraft) {
    primary = `Editing v${m.versionNumber} — unpublished draft`
  } else if (m.uiMode === "overwrite") {
    primary = `Draft of v${m.versionNumber} — publish overwrites v${m.versionNumber}`
  } else {
    primary = `Publish will create v${m.versionNumber}`
  }

  let secondary: string | null = null
  if (args.hasWorkingDraft && args.autosavedSecondsAgo != null) {
    secondary = `Draft — autosaved ${Math.max(0, Math.round(args.autosavedSecondsAgo))}s ago`
  } else if (args.hasWorkingDraft) {
    secondary = "Draft — working copy (not published)"
  }

  return { primary, secondary }
}

export function summarizeDraftOffer(args: {
  updatedAt: string
  linesChanged: number
  budgetDeltaDollars: number
}): string {
  const when = new Date(args.updatedAt)
  const whenLabel = Number.isNaN(when.getTime())
    ? args.updatedAt
    : when.toLocaleString()
  const delta = args.budgetDeltaDollars
  const deltaLabel =
    delta >= 0 ? `+$${Math.round(delta)}` : `-$${Math.round(Math.abs(delta))}`
  return `Draft from ${whenLabel} — ${args.linesChanged} lines changed, ${deltaLabel}. Resume · Compare · Discard`
}

export function pickNewerDraft(args: {
  localUpdatedAt: string | null
  serverUpdatedAt: string | null
}): { winner: "local" | "server" | "none"; reason: string } {
  const lt = args.localUpdatedAt ? Date.parse(args.localUpdatedAt) : NaN
  const st = args.serverUpdatedAt ? Date.parse(args.serverUpdatedAt) : NaN
  if (!Number.isFinite(lt) && !Number.isFinite(st)) {
    return { winner: "none", reason: "No drafts" }
  }
  if (!Number.isFinite(lt)) return { winner: "server", reason: "Server draft only" }
  if (!Number.isFinite(st)) return { winner: "local", reason: "Local draft only" }
  if (lt >= st) {
    return { winner: "local", reason: "Local draft is newer — using local" }
  }
  return { winner: "server", reason: "Server draft is newer — using server" }
}

export function buildStaleBaseCompare(args: {
  baseVersionId: number
  currentVersionId: number
  yoursLineCount: number
  tipLineCount: number
}): {
  baseVersionId: number
  currentVersionId: number
  sections: { base: string; yours: string; current: string }
} {
  return {
    baseVersionId: args.baseVersionId,
    currentVersionId: args.currentVersionId,
    sections: {
      base: `Base version id ${args.baseVersionId}`,
      yours: `Your draft (${args.yoursLineCount} lines)`,
      current: `Current tip version id ${args.currentVersionId} (${args.tipLineCount} lines)`,
    },
  }
}

export function draftAgeDays(updatedAt: string, now = new Date()): number {
  const t = Date.parse(updatedAt)
  if (!Number.isFinite(t)) return 0
  return Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000))
}

export function shouldNudgeStaleDraft(args: {
  updatedAt: string
  now?: Date
  days?: number
}): boolean {
  return draftAgeDays(args.updatedAt, args.now ?? new Date()) >= (args.days ?? 30)
}
