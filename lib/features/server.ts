/**
 * Server reads of feature switches (0111). See lib/features/registry.ts.
 *
 * isFeatureOn(key): the switch row, else the old env var, else the default.
 * Never call from middleware or edge code: those keep the env read
 * ("vercel" switches in the registry).
 */
import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { migrationMarkers } from "@/db/schema"
import { rowsOf } from "@/lib/xero/dbRows"

import {
  CLIENT_FEATURE_KEYS,
  FEATURE_DEFINITIONS,
  featureDefinition,
  resolveFeature,
  type ClientFeatureKey,
  type FeatureDefinition,
  type FeatureKey,
  type FeatureRow,
  type FeatureSource,
} from "./registry"
import { createFeatureRowStore, type FeatureRowReader, type FeatureRowStore } from "./store"

export const FEATURE_SWITCHES_MARKER = "0111_feature_switches"

export const FEATURE_SWITCHES_NOT_READY_MESSAGE =
  "Feature switches need migration 0111 (sql/supabase/2026-10-30_0111_feature_switches_SUPABASE.sql)."

type RawRow = {
  key: string
  enabled: boolean
  updated_at: string | null
  updated_by: number | string | null
  updated_by_name: string | null
  note: string | null
}

export function toFeatureRow(r: RawRow): FeatureRow {
  return {
    key: r.key,
    enabled: r.enabled === true,
    updatedAt: r.updated_at == null ? null : String(r.updated_at),
    updatedBy: r.updated_by == null ? null : Number(r.updated_by),
    updatedByName: r.updated_by_name ?? null,
    note: r.note ?? null,
  }
}

type MarkerReader = (key: string) => Promise<boolean>

/** Own marker read (not lib/finance/revisions/marker, which imports this module through its flag). */
const readMarker: MarkerReader = async (key) => {
  const rows = await getDb()
    .select({ key: migrationMarkers.key })
    .from(migrationMarkers)
    .where(eq(migrationMarkers.key, key))
    .limit(1)
  return rows.length > 0
}

export async function isFeatureSwitchesMigrationApplied(reader: MarkerReader = readMarker): Promise<boolean> {
  try {
    return await reader(FEATURE_SWITCHES_MARKER)
  } catch (err) {
    console.warn("[features] marker read failed", err)
    return false
  }
}

export const readFeatureRowsFromDb: FeatureRowReader = async () => {
  if (!(await isFeatureSwitchesMigrationApplied())) return null
  const rows = rowsOf<RawRow>(
    await getDb().execute(sql`
      SELECT key, enabled, updated_at::text AS updated_at, updated_by, updated_by_name, note
      FROM feature_switches
    `),
  )
  return new Map(rows.map((r) => [r.key, toFeatureRow(r)]))
}

const globalStore = globalThis as unknown as { __avFeatureRowStore?: FeatureRowStore }

function store(): FeatureRowStore {
  if (!globalStore.__avFeatureRowStore) {
    globalStore.__avFeatureRowStore = createFeatureRowStore(readFeatureRowsFromDb)
  }
  return globalStore.__avFeatureRowStore
}

/** Tests only: swap the reader (and clear the cache). */
export function setFeatureRowReaderForTests(reader: FeatureRowReader | null): void {
  globalStore.__avFeatureRowStore = reader ? createFeatureRowStore(reader) : undefined
}

/** Clears this instance's cache after a toggle. */
export function invalidateFeatureSwitches(): void {
  store().invalidate()
}

export async function readFeatureRows(): Promise<ReadonlyMap<string, FeatureRow> | null> {
  return store().read()
}

function definitionOrThrow(key: FeatureKey): FeatureDefinition {
  const def = featureDefinition(key)
  if (!def) throw new Error(`Unknown feature switch: ${key}`)
  return def
}

/** The switch value: row, else env, else default. Requires are the getter's job. */
export async function isFeatureOn(key: FeatureKey, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const def = definitionOrThrow(key)
  const rows = def.source === "vercel" ? null : await readFeatureRows()
  return resolveFeature(def, rows, env).enabled
}

export type FeatureState = {
  key: FeatureKey
  enabled: boolean
  source: FeatureSource
  row: FeatureRow | null
  definition: FeatureDefinition
}

export async function readFeatureStates(env: Record<string, string | undefined> = process.env): Promise<{
  ready: boolean
  states: FeatureState[]
}> {
  const rows = await readFeatureRows()
  return {
    ready: rows != null,
    states: FEATURE_DEFINITIONS.map((def) => {
      const r = resolveFeature(def, rows, env)
      return {
        key: def.key as FeatureKey,
        enabled: r.enabled,
        source: r.source,
        row: rows?.get(def.key) ?? null,
        definition: def,
      }
    }),
  }
}

export type ClientFeatureSnapshot = Record<ClientFeatureKey, boolean>

/** The browser-visible switches, sent once per page render by the root layout. */
export async function readClientFeatureSnapshot(
  env: Record<string, string | undefined> = process.env,
): Promise<ClientFeatureSnapshot> {
  const rows = await readFeatureRows()
  const out = {} as ClientFeatureSnapshot
  for (const key of CLIENT_FEATURE_KEYS) {
    out[key] = resolveFeature(definitionOrThrow(key), rows, env).enabled
  }
  return out
}

export type FeatureSwitchEvent = {
  id: number
  createdAt: string
  key: string
  fromEnabled: boolean | null
  toEnabled: boolean
  changedByName: string | null
  note: string | null
}

export async function readFeatureSwitchEvents(limit = 50): Promise<FeatureSwitchEvent[]> {
  if (!(await isFeatureSwitchesMigrationApplied())) return []
  const rows = rowsOf<{
    id: number | string
    created_at: string
    key: string
    from_enabled: boolean | null
    to_enabled: boolean
    changed_by_name: string | null
    note: string | null
  }>(
    await getDb().execute(sql`
      SELECT id, created_at::text AS created_at, key, from_enabled, to_enabled, changed_by_name, note
      FROM feature_switch_events
      ORDER BY created_at DESC, id DESC
      LIMIT ${Math.max(1, Math.min(200, Math.trunc(limit)))}
    `),
  )
  return rows.map((r) => ({
    id: Number(r.id),
    createdAt: String(r.created_at),
    key: r.key,
    fromEnabled: r.from_enabled,
    toEnabled: r.to_enabled === true,
    changedByName: r.changed_by_name ?? null,
    note: r.note ?? null,
  }))
}

export type SetFeatureSwitchResult =
  | { ok: true; key: FeatureKey; enabled: boolean; changed: boolean }
  | { ok: false; status: number; code: "NOT_READY" | "UNKNOWN_KEY" | "SET_IN_VERCEL"; message: string }

/**
 * Writes the switch row and one event in one transaction, then clears this
 * instance's cache. `from` is the value the app was using (row, env or default).
 */
export async function setFeatureSwitch(args: {
  key: string
  enabled: boolean
  note: string | null
  actor: { id: number | null; name: string | null }
  env?: Record<string, string | undefined>
}): Promise<SetFeatureSwitchResult> {
  const def = featureDefinition(args.key)
  if (!def) return { ok: false, status: 400, code: "UNKNOWN_KEY", message: "Unknown feature switch." }
  if (def.source === "vercel") {
    return { ok: false, status: 400, code: "SET_IN_VERCEL", message: def.vercelReason ?? "This one is set in Vercel." }
  }
  if (!(await isFeatureSwitchesMigrationApplied())) {
    return { ok: false, status: 409, code: "NOT_READY", message: FEATURE_SWITCHES_NOT_READY_MESSAGE }
  }
  const note = args.note?.trim() ? args.note.trim().slice(0, 500) : null
  const actorId = args.actor.id != null && Number.isFinite(args.actor.id) && args.actor.id > 0 ? args.actor.id : null
  const actorName = args.actor.name?.trim() ? args.actor.name.trim().slice(0, 200) : null
  let changed = false
  await getDb().transaction(async (tx) => {
    const current = rowsOf<RawRow>(
      await tx.execute(sql`
        SELECT key, enabled, updated_at::text AS updated_at, updated_by, updated_by_name, note
        FROM feature_switches WHERE key = ${def.key} FOR UPDATE
      `),
    )[0]
    const before = resolveFeature(
      def,
      current ? new Map([[def.key, toFeatureRow(current)]]) : new Map(),
      args.env ?? process.env,
    ).enabled
    changed = before !== args.enabled
    await tx.execute(sql`
      INSERT INTO feature_switches (key, enabled, updated_at, updated_by, updated_by_name, note)
      VALUES (${def.key}, ${args.enabled}, now(), ${actorId}, ${actorName}, ${note})
      ON CONFLICT (key) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by,
        updated_by_name = EXCLUDED.updated_by_name,
        note = EXCLUDED.note
    `)
    await tx.execute(sql`
      INSERT INTO feature_switch_events (key, from_enabled, to_enabled, changed_by, changed_by_name, note)
      VALUES (${def.key}, ${before}, ${args.enabled}, ${actorId}, ${actorName}, ${note})
    `)
  })
  invalidateFeatureSwitches()
  return { ok: true, key: def.key as FeatureKey, enabled: args.enabled, changed }
}
