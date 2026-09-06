/**
 * PC7 — plan save pill + draft helpers.
 * Pill text is driven by the SAME `resolvePostgresSaveMode` mapping as T4c.
 */

import {
  SAVE_PUBLISHES_IMMEDIATELY,
  type ResolvePostgresSaveModeResult,
} from "@/lib/mediaplan/resolvePostgresSaveMode"

export type PlanSavePill = {
  primary: string
  secondary: string | null
}

export function describePlanSavePill(args: {
  modeResolved: ResolvePostgresSaveModeResult
  hasWorkingDraft: boolean
  autosavedSecondsAgo: number | null
  editingUnpublishedDraft: boolean
  /** Version ordinal loaded in the editor (omit on create). */
  editingVersionNumber?: number | null
  /** Published tip ordinal at session start (omit on create). */
  publishedTipVersionNumber?: number | null
}): PlanSavePill {
  const { modeResolved: m } = args
  const editing = Number(args.editingVersionNumber) || 0
  const tip = Number(args.publishedTipVersionNumber) || 0
  const forkingOlder = editing > 0 && tip > 0 && editing !== tip
  let primary: string
  if (args.editingUnpublishedDraft) {
    // Resolver versionNumber is the save target. Under save-equals-publish
    // that is next, but this label names the unpublished version in the editor.
    const loaded =
      SAVE_PUBLISHES_IMMEDIATELY && m.uiMode === "increment" && m.versionNumber > 1
        ? m.versionNumber - 1
        : m.versionNumber
    primary = `Editing v${loaded} — unpublished draft`
  } else if (m.uiMode === "overwrite") {
    primary = `Draft of v${m.versionNumber} — publish overwrites v${m.versionNumber}`
  } else if (m.uiMode === "working_draft") {
    primary = `Working draft of v${m.versionNumber} — publish creates next version`
  } else if (m.uiMode === "increment_unpublished") {
    primary = `Will cut v${m.versionNumber} (stays unpublished)`
  } else if (SAVE_PUBLISHES_IMMEDIATELY && forkingOlder) {
    primary = `Save will create v${m.versionNumber} from v${editing} · published tip is v${tip}`
  } else if (SAVE_PUBLISHES_IMMEDIATELY) {
    primary = `Save will create v${m.versionNumber}`
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

/**
 * Wizard header trail after "v{n} · …".
 * Same `ResolvePostgresSaveModeResult` as `describePlanSavePill` — never tip+1 alone.
 * Overwrite: no "Next" (publish replaces tip). Published tip: "Next: v{n+1}".
 */
export function describeVersionHeaderTrail(
  modeResolved: ResolvePostgresSaveModeResult
): string {
  const n = modeResolved.versionNumber
  if (modeResolved.uiMode === "overwrite") {
    return `publish overwrites v${n}`
  }
  if (modeResolved.uiMode === "working_draft") {
    return `Next: v${n + 1}`
  }
  if (modeResolved.uiMode === "increment_unpublished") {
    return `Will cut v${n} (stays unpublished)`
  }
  return `Next: v${n}`
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
      base: `Tip at load version id ${args.baseVersionId}`,
      yours: `Your draft (${args.yoursLineCount} lines)`,
      current: `Current tip version id ${args.currentVersionId} (${args.tipLineCount} lines)`,
    },
  }
}

/**
 * SV-1 stale-base: another editor published during this session.
 * `tipVersionIdAtLoad` is the published pointer the editor saw at load.
 * The chosen `baseVersionId` (version being forked) does not participate.
 * Create sends null → never 409.
 */
export function isStalePublishedTip(args: {
  mode: "draft" | "new_version" | "publish"
  tipVersionIdAtLoad: number | null | undefined
  currentPublishedVersionId: number | null
}): boolean {
  if (args.tipVersionIdAtLoad == null) return false
  if (args.mode !== "publish" && args.mode !== "new_version") return false
  if (args.currentPublishedVersionId == null) return false
  return args.currentPublishedVersionId !== args.tipVersionIdAtLoad
}

/**
 * Published pointer the editor saw at load. Prefers the version-picker row
 * for the newest ordinal; falls back to master `published_version_id`.
 */
export function resolveTipVersionIdAtLoad(args: {
  publishedVersionId?: unknown
  versions: Array<{ id?: number; version_number: number }>
  latestVersionNumber: number
}): number | null {
  const fromPicker = args.versions.find(
    (v) => v.version_number === args.latestVersionNumber
  )?.id
  if (typeof fromPicker === "number" && Number.isFinite(fromPicker) && fromPicker > 0) {
    return fromPicker
  }
  const pointer = Number(args.publishedVersionId)
  if (Number.isFinite(pointer) && pointer > 0) return pointer
  return null
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
