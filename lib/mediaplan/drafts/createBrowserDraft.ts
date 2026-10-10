import { countCreateDraftLines } from "@/lib/mediaplan/drafts/createLocalDraft"
import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"

/** File wrapper around the autosave payload. Reject any other number. */
export const CREATE_DRAFT_FILE_SCHEMA_VERSION = 1

export const CREATE_DRAFT_SESSION_KEY = "av-create-draft-id"

const DRAFT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCreateDraftId(value: string): boolean {
  return DRAFT_ID.test(value.trim())
}

export function createBrowserDraftKey(draftId: string, userId: string): string {
  return `draft:${draftId}::${userId}`
}

export function parseLegacyMbaDraftKey(
  key: string,
): { mba: string; userId: string } | null {
  if (!key.startsWith("mba:")) return null
  const sep = key.indexOf("::")
  if (sep < 4) return null
  const mba = key.slice(4, sep)
  const userId = key.slice(sep + 2)
  if (!mba || !userId) return null
  return { mba, userId }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim()
}

export function createDraftListFields(
  state: PlanDraftStateV1,
  previewMba: string,
): {
  clientName: string
  campaignName: string
  previewMba: string
  lineCount: number
} {
  const fv = state.formValues ?? {}
  return {
    clientName: str(fv.mp_client_name) || "No client",
    campaignName: str(fv.mp_campaignname) || "untitled",
    previewMba: previewMba.trim(),
    lineCount: countCreateDraftLines(state),
  }
}

export type CreateDraftRow = {
  key: string
  updatedAt: string
  state: PlanDraftStateV1
  draftId?: string
  clientName?: string
  campaignName?: string
  previewMba?: string
  lineCount?: number
}

export function buildCreateBrowserDraftRow(args: {
  draftId: string
  userId: string
  state: PlanDraftStateV1
  updatedAt: string
}): CreateDraftRow {
  const fields = createDraftListFields(args.state, args.state.mbaNumber ?? "")
  return {
    key: createBrowserDraftKey(args.draftId, args.userId),
    draftId: args.draftId,
    updatedAt: args.updatedAt,
    ...fields,
    state: args.state,
  }
}

/**
 * Move `mba:{MBA}::{userId}` rows onto `draft:{id}::{userId}`.
 * Other users and edit `m{masterId}` rows stay put. Nothing is dropped.
 */
export function migrateLegacyCreateDraftRecords(
  records: readonly CreateDraftRow[],
  userId: string,
  newId: () => string,
): { next: CreateDraftRow[]; migrated: number } {
  const next: CreateDraftRow[] = []
  let migrated = 0
  for (const row of records) {
    const legacy = parseLegacyMbaDraftKey(row.key)
    if (!legacy || legacy.userId !== userId) {
      next.push(row)
      continue
    }
    const draftId = newId()
    const fields = createDraftListFields(row.state, legacy.mba)
    next.push({
      key: createBrowserDraftKey(draftId, userId),
      draftId,
      updatedAt: row.updatedAt,
      ...fields,
      state: row.state,
    })
    migrated += 1
  }
  return { next, migrated }
}

export type CreateDraftFile = {
  schemaVersion: number
  payload: PlanDraftStateV1
}

export function exportCreateDraftFile(state: PlanDraftStateV1): CreateDraftFile {
  return {
    schemaVersion: CREATE_DRAFT_FILE_SCHEMA_VERSION,
    payload: state,
  }
}

export function importCreateDraftFile(
  raw: unknown,
): { ok: true; payload: PlanDraftStateV1 } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "This file isn't a draft." }
  }
  const file = raw as { schemaVersion?: unknown; payload?: PlanDraftStateV1 }
  if (file.schemaVersion !== CREATE_DRAFT_FILE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: "This draft file can't be opened. It uses a different version.",
    }
  }
  const payload = file.payload
  if (!payload || payload.v !== 1 || typeof payload.formValues !== "object") {
    return { ok: false, error: "This file isn't a draft." }
  }
  return { ok: true, payload }
}

export function createDraftExportFilename(client: string, campaign: string): string {
  const clean = (value: string, fallback: string) =>
    (value.trim() || fallback).replace(/[\\/:*?"<>|]/g, "").trim() || fallback
  return `DRAFT - ${clean(client, "No client")} - ${clean(campaign, "untitled")} - draft.json`
}

export function upsertCreateBrowserDraft(
  store: Map<string, CreateDraftRow>,
  args: {
    draftId: string
    userId: string
    state: PlanDraftStateV1
    updatedAt: string
  },
): void {
  const row = buildCreateBrowserDraftRow(args)
  store.set(row.key, row)
}

export function removeCreateBrowserDraft(
  store: Map<string, CreateDraftRow>,
  draftId: string,
  userId: string,
): void {
  store.delete(createBrowserDraftKey(draftId, userId))
}
