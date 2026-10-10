/**
 * Tier 1 — IndexedDB soft save (no dependency). Cleared when tier 2/3 lands.
 */

import {
  buildCreateBrowserDraftRow,
  createBrowserDraftKey,
  migrateLegacyCreateDraftRecords,
  parseLegacyMbaDraftKey,
  type CreateDraftRow,
} from "@/lib/mediaplan/drafts/createBrowserDraft"
import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"

const DB_NAME = "av-plan-drafts"
const STORE = "drafts"
const DB_VERSION = 1

export type LocalDraftRecord = CreateDraftRow & {
  key: string
  updatedAt: string
  state: PlanDraftStateV1
}

function localKey(masterId: number | null, mbaNumber: string, userId: string): string {
  const m = masterId != null ? `m${masterId}` : `mba:${mbaNumber.toUpperCase()}`
  return `${m}::${userId}`
}

function draftKey(args: {
  masterId: number | null
  mbaNumber: string
  userId: string
  createDraftId?: string | null
}): string {
  if (args.masterId == null && args.createDraftId) {
    return createBrowserDraftKey(args.createDraftId, args.userId)
  }
  return localKey(args.masterId, args.mbaNumber, args.userId)
}

/** Same key persistLocal / persistServer use — re-login with the same userId recovers this record. */
export function localDraftStorageKey(args: {
  masterId: number | null
  mbaNumber: string
  userId: string
}): string {
  return localKey(args.masterId, args.mbaNumber, args.userId)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

export async function writeLocalDraft(args: {
  masterId: number | null
  mbaNumber: string
  userId: string
  state: PlanDraftStateV1
  /** Create tab id. Absent on the edit-page master key. */
  createDraftId?: string | null
}): Promise<LocalDraftRecord> {
  const updatedAt = new Date().toISOString()
  const record: LocalDraftRecord =
    args.masterId == null && args.createDraftId
      ? {
          ...buildCreateBrowserDraftRow({
            draftId: args.createDraftId,
            userId: args.userId,
            state: args.state,
            updatedAt,
          }),
        }
      : {
          key: localKey(args.masterId, args.mbaNumber, args.userId),
          updatedAt,
          state: args.state,
        }
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"))
  })
  db.close()
  return record
}

export async function readLocalDraft(args: {
  masterId: number | null
  mbaNumber: string
  userId: string
  createDraftId?: string | null
}): Promise<LocalDraftRecord | null> {
  const key = draftKey(args)
  const db = await openDb()
  const row = await new Promise<LocalDraftRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve((req.result as LocalDraftRecord) ?? null)
    req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"))
  })
  db.close()
  return row
}

export async function clearLocalDraft(args: {
  masterId: number | null
  mbaNumber: string
  userId: string
  createDraftId?: string | null
}): Promise<void> {
  const keys = new Set<string>([draftKey(args)])
  if (args.createDraftId) keys.add(createBrowserDraftKey(args.createDraftId, args.userId))
  if (args.masterId != null) keys.add(localKey(args.masterId, args.mbaNumber, args.userId))
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    const store = tx.objectStore(STORE)
    for (const key of keys) store.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB delete failed"))
  })
  db.close()
}

async function readAllLocalDrafts(): Promise<LocalDraftRecord[]> {
  const db = await openDb()
  const rows = await new Promise<LocalDraftRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly")
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as LocalDraftRecord[]) ?? [])
    req.onerror = () => reject(req.error ?? new Error("indexedDB getAll failed"))
  })
  db.close()
  return rows
}

async function replaceLocalDrafts(args: {
  put: LocalDraftRecord[]
  removeKeys: string[]
}): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    const store = tx.objectStore(STORE)
    for (const key of args.removeKeys) store.delete(key)
    for (const row of args.put) store.put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB replace failed"))
  })
  db.close()
}

/** First Create open: `mba:{MBA}::{userId}` becomes `draft:{id}::{userId}`. */
export async function migrateLegacyCreateDrafts(userId: string): Promise<number> {
  const all = await readAllLocalDrafts()
  const removedKeys = all
    .filter((row) => parseLegacyMbaDraftKey(row.key)?.userId === userId)
    .map((row) => row.key)
  const { next, migrated } = migrateLegacyCreateDraftRecords(all, userId, () =>
    crypto.randomUUID(),
  )
  if (migrated === 0) return 0
  const put = next.filter((row) => !all.some((prev) => prev.key === row.key))
  await replaceLocalDrafts({ put, removeKeys: removedKeys })
  return migrated
}

export async function listCreateBrowserDrafts(userId: string): Promise<LocalDraftRecord[]> {
  const all = await readAllLocalDrafts()
  return all.filter((row) => {
    if (!row.draftId) return false
    return row.key === createBrowserDraftKey(row.draftId, userId)
  })
}

export function estimateDraftPayloadBytes(state: PlanDraftStateV1): number {
  return new TextEncoder().encode(JSON.stringify(state)).length
}
