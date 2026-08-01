/**
 * Tier 1 — IndexedDB soft save (no dependency). Cleared when tier 2/3 lands.
 */

import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"

const DB_NAME = "av-plan-drafts"
const STORE = "drafts"
const DB_VERSION = 1

export type LocalDraftRecord = {
  key: string
  updatedAt: string
  state: PlanDraftStateV1
}

function localKey(masterId: number | null, mbaNumber: string, userId: string): string {
  const m = masterId != null ? `m${masterId}` : `mba:${mbaNumber.toUpperCase()}`
  return `${m}::${userId}`
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
}): Promise<LocalDraftRecord> {
  const key = localKey(args.masterId, args.mbaNumber, args.userId)
  const record: LocalDraftRecord = {
    key,
    updatedAt: new Date().toISOString(),
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
}): Promise<LocalDraftRecord | null> {
  const key = localKey(args.masterId, args.mbaNumber, args.userId)
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
}): Promise<void> {
  const key = localKey(args.masterId, args.mbaNumber, args.userId)
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite")
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB delete failed"))
  })
  db.close()
}

export function estimateDraftPayloadBytes(state: PlanDraftStateV1): number {
  return new TextEncoder().encode(JSON.stringify(state)).length
}
