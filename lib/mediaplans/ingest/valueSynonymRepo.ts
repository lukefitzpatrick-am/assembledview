/**
 * Publisher value-synonym overlay + types (0060).
 * Postgres reads/writes live in valueSynonymRepo.server.ts.
 * Never import the .server sibling from a Client Component.
 */

export type ValueSynonymScope = "publisher" | "global"

export type ValueSynonymRow = {
  id: number
  publisherId: number | null
  scope: ValueSynonymScope
  mediaType: string
  vocabulary: string
  avField: string
  rawValue: string
  rawValueDisplay: string
  avCanonical: string
  learnedFromStageId: string | null
  createdBy: string
  isActive: boolean
  retiredAt: string | null
  retiredBy: string | null
}

type OverlayRow = ValueSynonymRow

const overlay: OverlayRow[] = []
let overlaySeq = 1

export function clearValueSynonymOverlayForTests() {
  overlay.length = 0
  overlaySeq = 1
}

export function getValueSynonymOverlayForTests(): readonly ValueSynonymRow[] {
  return overlay
}

export function scopeOf(publisherId: number | null): ValueSynonymScope {
  return publisherId == null ? "global" : "publisher"
}

function toRow(row: OverlayRow): ValueSynonymRow {
  return { ...row, scope: scopeOf(row.publisherId) }
}

export function listSynonymsFromOverlay(args: {
  vocabulary: string
  publisherId: number | null
}): ValueSynonymRow[] {
  return overlay
    .filter((row) => row.isActive && row.vocabulary === args.vocabulary)
    .filter(
      (row) =>
        row.publisherId == null ||
        (args.publisherId != null && row.publisherId === args.publisherId),
    )
    .map(toRow)
}

export function upsertOverlay(row: ValueSynonymRow) {
  const idx = overlay.findIndex((r) => r.id === row.id)
  if (idx >= 0) overlay[idx] = row
  else overlay.push(row)
}

export function retireOverlaySynonym(id: number, retiredBy: string): void {
  const row = overlay.find((r) => r.id === id)
  if (row) {
    row.isActive = false
    row.retiredAt = new Date().toISOString()
    row.retiredBy = retiredBy
  }
}

export function learnSynonymOnOverlay(args: {
  publisherId: number | null
  mediaType: string
  vocabulary: string
  avField: string
  rawValue: string
  rawValueDisplay: string
  avCanonical: string
  learnedFromStageId: string | null
  createdBy: string
}): ValueSynonymRow {
  const current = overlay.find(
    (row) =>
      row.isActive &&
      row.vocabulary === args.vocabulary &&
      row.rawValue === args.rawValue &&
      (row.publisherId ?? null) === (args.publisherId ?? null),
  )
  if (current && current.avCanonical === args.avCanonical) {
    return toRow(current)
  }
  if (current) {
    current.isActive = false
    current.retiredAt = new Date().toISOString()
    current.retiredBy = args.createdBy
  }
  const created: OverlayRow = {
    id: overlaySeq++,
    publisherId: args.publisherId,
    scope: scopeOf(args.publisherId),
    mediaType: args.mediaType,
    vocabulary: args.vocabulary,
    avField: args.avField,
    rawValue: args.rawValue,
    rawValueDisplay: args.rawValueDisplay,
    avCanonical: args.avCanonical,
    learnedFromStageId: args.learnedFromStageId,
    createdBy: args.createdBy,
    isActive: true,
    retiredAt: null,
    retiredBy: null,
  }
  overlay.push(created)
  return toRow(created)
}
