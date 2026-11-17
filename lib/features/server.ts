/**
 * Server reads of feature switches (0111). See lib/features/registry.ts.
 *
 * isFeatureOn(key): the switch row, else the old env var, else the default,
 * and every switch in its `requires`, transitively.
 * Never call from middleware or edge code: those keep the env read
 * ("vercel" switches in the registry).
 */
import "server-only"

import { eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { migrationMarkers } from "@/db/schema"
import { isMarkerApplied } from "@/lib/db/markers"
import { rowsOf } from "@/lib/xero/dbRows"

import {
  CLIENT_FEATURE_KEYS,
  effectiveFeatureOn,
  FEATURE_DEFINITIONS,
  FEATURE_MARKERS,
  featureDefinition,
  featureToggleRefusal,
  resolveFeature,
  unsavedFeatureSwitches,
  type ClientFeatureKey,
  type FeatureDefinition,
  type FeatureKey,
  type FeatureRow,
  type FeatureSource,
  type UnsavedFeatureSwitch,
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

let markerReader: (marker: string) => Promise<boolean> = (marker) => isMarkerApplied(marker)

/** The registry's `requiresMarker` keys that exist, through lib/db/markers (cached there). */
async function readSwitchMarkers(): Promise<ReadonlySet<string>> {
  const found = await Promise.all(FEATURE_MARKERS.map(async (m) => ((await markerReader(m)) ? m : null)))
  return new Set(found.filter((m): m is string => m != null))
}

/**
 * Tests only: swap the row reader (and clear the cache). While a reader is
 * set, the switch markers read as `markers` (default: all applied); null
 * puts the database back for both.
 */
export function setFeatureRowReaderForTests(reader: FeatureRowReader | null, markers: readonly string[] = FEATURE_MARKERS): void {
  globalStore.__avFeatureRowStore = reader ? createFeatureRowStore(reader) : undefined
  markerReader = reader ? async (m) => markers.includes(m) : (m) => isMarkerApplied(m)
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

/** Each switch's own value (row, else env, else default) as a lookup for `effectiveFeatureOn`. */
function rawLookup(rows: ReadonlyMap<string, FeatureRow> | null, env: Record<string, string | undefined>) {
  return (key: string) => resolveFeature(definitionOrThrow(key as FeatureKey), rows, env).enabled
}

/**
 * The live value: the switch's own value (row, else env, else default), its
 * migration marker, and every switch it requires, transitively. Callers
 * never re-check `requires` or the marker.
 */
export async function isFeatureOn(key: FeatureKey, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const def = definitionOrThrow(key)
  if (def.source === "vercel" && !def.requires?.length) return resolveFeature(def, null, env).enabled
  const [rows, markers] = await Promise.all([readFeatureRows(), readSwitchMarkers()])
  return effectiveFeatureOn(key, rawLookup(rows, env), (m) => markers.has(m))
}

export type FeatureState = {
  key: FeatureKey
  enabled: boolean
  source: FeatureSource
  row: FeatureRow | null
  definition: FeatureDefinition
  /** When the switch row last went from off (or no row) to on, as an ISO instant; null when off or env-only. */
  onSince: string | null
}

/**
 * S16: when each switch that is on now was turned on. The latest audit event
 * that turned it on (not a save at the same value); a row saved on with no
 * such event (Save current values) falls back to the row's updated time.
 */
async function readOnSince(): Promise<Map<string, string>> {
  const rows = rowsOf<{ key: string; on_since: string }>(
    await getDb().execute(sql`
      SELECT s.key, to_json(coalesce(e.on_at, s.updated_at)) #>> '{}' AS on_since
      FROM feature_switches s
      LEFT JOIN (
        SELECT key, max(created_at) AS on_at FROM feature_switch_events
        WHERE to_enabled AND from_enabled IS DISTINCT FROM true
        GROUP BY key
      ) e USING (key)
      WHERE s.enabled
    `),
  )
  return new Map(rows.map((r) => [r.key, String(r.on_since)]))
}

export async function readFeatureStates(env: Record<string, string | undefined> = process.env): Promise<{
  ready: boolean
  states: FeatureState[]
  /** The registry's migration markers that exist. */
  markers: string[]
}> {
  const [rows, markers] = await Promise.all([readFeatureRows(), readSwitchMarkers()])
  const onSince = rows
    ? await readOnSince().catch((err) => {
        console.warn("[features] on-since read failed; page shows no dates", err)
        return new Map<string, string>()
      })
    : new Map<string, string>()
  return {
    ready: rows != null,
    markers: [...markers],
    states: FEATURE_DEFINITIONS.map((def) => {
      const r = resolveFeature(def, rows, env)
      return {
        key: def.key as FeatureKey,
        enabled: r.enabled,
        source: r.source,
        row: rows?.get(def.key) ?? null,
        definition: def,
        onSince: r.source === "switch" && r.enabled ? (onSince.get(def.key) ?? null) : null,
      }
    }),
  }
}

export type ClientFeatureSnapshot = Record<ClientFeatureKey, boolean>

/**
 * The browser-visible switches, sent once per page render by the root
 * layout. Each value is live (requirements resolved here, including ones the
 * browser never sees), so browser code reads one value per switch.
 */
export async function readClientFeatureSnapshot(
  env: Record<string, string | undefined> = process.env,
): Promise<ClientFeatureSnapshot> {
  const [rows, markers] = await Promise.all([readFeatureRows(), readSwitchMarkers()])
  const raw = rawLookup(rows, env)
  const out = {} as ClientFeatureSnapshot
  for (const key of CLIENT_FEATURE_KEYS) out[key] = effectiveFeatureOn(key, raw, (m) => markers.has(m))
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

/** Serialises switch writes for the dependency check (released at commit). */
const SWITCH_WRITE_LOCK = sql`SELECT pg_advisory_xact_lock(hashtext('feature_switches'))`

export type SetFeatureSwitchResult =
  | { ok: true; key: FeatureKey; enabled: boolean; changed: boolean }
  | { ok: false; status: number; code: "NOT_READY" | "UNKNOWN_KEY" | "SET_IN_VERCEL" | "SWITCH_DEPENDENCY"; message: string }

/**
 * Writes the switch row and one event in one transaction, then clears this
 * instance's cache. `from` is the value the app was using (row, env or default).
 * Refuses (409 SWITCH_DEPENDENCY, nothing written) to turn a switch on while
 * its migration marker is missing or a requirement is off, or off while a
 * switch that requires it is on (S16).
 * Switch writes take one transaction lock, so two toggles can't race past
 * the check (a missing row can't be locked with FOR UPDATE).
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
  const env = args.env ?? process.env
  const markers = await readSwitchMarkers()
  const markerApplied = (m: string) => markers.has(m)
  let changed = false
  const refusal = await getDb().transaction(async (tx): Promise<string | null> => {
    await tx.execute(SWITCH_WRITE_LOCK)
    const rows = new Map(
      rowsOf<RawRow>(
        await tx.execute(sql`
          SELECT key, enabled, updated_at::text AS updated_at, updated_by, updated_by_name, note
          FROM feature_switches
        `),
      ).map((r) => [r.key, toFeatureRow(r)]),
    )
    const raw = rawLookup(rows, env)
    const refused = featureToggleRefusal(def.key, args.enabled, raw, (k) => effectiveFeatureOn(k, raw, markerApplied), markerApplied)
    if (refused) return refused
    const before = raw(def.key)
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
    return null
  })
  if (refusal) return { ok: false, status: 409, code: "SWITCH_DEPENDENCY", message: refusal }
  invalidateFeatureSwitches()
  return { ok: true, key: def.key as FeatureKey, enabled: args.enabled, changed }
}

export type SaveCurrentFeatureValuesResult =
  | { ok: true; saved: UnsavedFeatureSwitch[] }
  | { ok: false; status: 409; code: "NOT_READY"; message: string }

/**
 * B7 (G9): writes a row for every page switch that has none, at the value it
 * has now (env var or default), with one event each. A switch that already
 * has a row is left alone, including one toggled while this runs (the insert
 * is ON CONFLICT DO NOTHING). Nothing changes behaviour: each row holds the
 * value the app was already using. After this, an env var no longer drives
 * any page switch.
 */
export async function saveCurrentFeatureValues(args: {
  actor: { id: number | null; name: string | null }
  env?: Record<string, string | undefined>
}): Promise<SaveCurrentFeatureValuesResult> {
  if (!(await isFeatureSwitchesMigrationApplied())) {
    return { ok: false, status: 409, code: "NOT_READY", message: FEATURE_SWITCHES_NOT_READY_MESSAGE }
  }
  const env = args.env ?? process.env
  const actorId = args.actor.id != null && Number.isFinite(args.actor.id) && args.actor.id > 0 ? args.actor.id : null
  const actorName = args.actor.name?.trim() ? args.actor.name.trim().slice(0, 200) : null
  const saved: UnsavedFeatureSwitch[] = []
  await getDb().transaction(async (tx) => {
    await tx.execute(SWITCH_WRITE_LOCK)
    const existing = rowsOf<RawRow>(
      await tx.execute(sql`
        SELECT key, enabled, updated_at::text AS updated_at, updated_by, updated_by_name, note
        FROM feature_switches
      `),
    )
    const rows = new Map(existing.map((r) => [r.key, toFeatureRow(r)]))
    for (const u of unsavedFeatureSwitches(rows, env)) {
      const def = definitionOrThrow(u.key)
      const note =
        u.source === "env" && def.envName
          ? `Saved the value it had from env var ${def.envName}`
          : "Saved the value it had (default)"
      const inserted = rowsOf<{ key: string }>(
        await tx.execute(sql`
          INSERT INTO feature_switches (key, enabled, updated_at, updated_by, updated_by_name, note)
          VALUES (${u.key}, ${u.enabled}, now(), ${actorId}, ${actorName}, ${note})
          ON CONFLICT (key) DO NOTHING
          RETURNING key
        `),
      )
      if (inserted.length === 0) continue
      await tx.execute(sql`
        INSERT INTO feature_switch_events (key, from_enabled, to_enabled, changed_by, changed_by_name, note)
        VALUES (${u.key}, ${u.enabled}, ${u.enabled}, ${actorId}, ${actorName}, ${note})
      `)
      saved.push(u)
    }
  })
  invalidateFeatureSwitches()
  return { ok: true, saved }
}
