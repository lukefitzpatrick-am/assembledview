/**
 * Postgres-authoritative client writes (X1 split-brain fix).
 * Order: PG insert/update → invalidate caches → best-effort Xano mirror
 * (failure → app_notifications, never blocks / rolls back PG).
 */
import "server-only"

import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"
import { xanoPostHeaderRecord, getXanoTimeoutMs } from "@/lib/api/xano"
import { invalidateClientsCache } from "@/lib/cache/clientsCache"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"
import { invalidateCachedClients } from "@/lib/finance/xanoReferenceCache"
import { mapClientRowFromPostgres } from "@/lib/data/readClients"

export const CLIENT_MIRROR_FAILURE_KIND = "xano_client_mirror_failed"
export const CLIENT_MIRROR_FAILURE_AUDIENCE = "admin"

/** Columns clients writes may set (API snake_case → drizzle). */
const WRITABLE_SNAKE_TO_CAMEL: Record<string, keyof typeof schema.clients.$inferInsert> = {
  mp_client_name: "mpClientName",
  clientcategory: "clientcategory",
  abn: "abn",
  mbaidentifier: "mbaidentifier",
  legalbusinessname: "legalbusinessname",
  streetaddress: "streetaddress",
  suburb: "suburb",
  state_dropdown: "stateDropdown",
  postcode: "postcode",
  keyfirstname: "keyfirstname",
  keylastname: "keylastname",
  keyphone: "keyphone",
  keyemail: "keyemail",
  billingfirstname: "billingfirstname",
  billinglastname: "billinglastname",
  billingphone: "billingphone",
  billingemail: "billingemail",
  monthlyretainer: "monthlyretainer",
  organicsocial: "organicsocial",
  television_checkbox: "televisionCheckbox",
  radio_checkbox: "radioCheckbox",
  newspapers_checkbox: "newspapersCheckbox",
  magazines_checkbox: "magazinesCheckbox",
  ooh_checkbox: "oohCheckbox",
  cinema_checkbox: "cinemaCheckbox",
  digitaldisplay_checkbox: "digitaldisplayCheckbox",
  digitalaudio_checkbox: "digitalaudioCheckbox",
  digitalvideo_checkbox: "digitalvideoCheckbox",
  bvod_checkbox: "bvodCheckbox",
  feesocial: "feesocial",
  feesearch: "feesearch",
  feeprogdisplay: "feeprogdisplay",
  feeprogvideo: "feeprogvideo",
  feeprogbvod: "feeprogbvod",
  feeprogaudio: "feeprogaudio",
  feeprogooh: "feeprogooh",
  feecontentcreator: "feecontentcreator",
  adservvideo: "adservvideo",
  adservimp: "adservimp",
  adservdisplay: "adservdisplay",
  adservaudio: "adservaudio",
  idgoogleads: "idgoogleads",
  idmeta: "idmeta",
  idcm360: "idcm360",
  iddv360: "iddv360",
  idtiktok: "idtiktok",
  idlinkedin: "idlinkedin",
  idpinterest: "idpinterest",
  idquantcast: "idquantcast",
  idtaboola: "idtaboola",
  idsnapchat: "idsnapchat",
  idbing: "idbing",
  idvistar: "idvistar",
  idga4: "idga4",
  idmerchantcentre: "idmerchantcentre",
  idshopify: "idshopify",
  payment_days: "paymentDays",
  payment_terms: "paymentTerms",
  brand_colour: "brandColour",
  client_logo: "clientLogo",
  website: "website",
  facebook_url: "facebookUrl",
  instagram_url: "instagramUrl",
  linkedin_url: "linkedinUrl",
  tiktok_url: "tiktokUrl",
  client_brain: "clientBrain",
  client_brain_updated_at: "clientBrainUpdatedAt",
  slug: "slug",
  sharepoint_site_url: "sharepointSiteUrl",
  teams_group_id: "teamsGroupId",
  m365_is_anchor: "m365IsAnchor",
}

export type ClientMirrorFailurePayload = {
  op: "create" | "update" | "patch"
  clientId: number
  error: string
  timestamp: string
  retried: boolean
}

export function buildClientMirrorFailurePayload(input: {
  op: "create" | "update" | "patch"
  clientId: number
  error: string
  at?: Date
}): ClientMirrorFailurePayload {
  return {
    op: input.op,
    clientId: input.clientId,
    error: input.error,
    timestamp: (input.at ?? new Date()).toISOString(),
    retried: false,
  }
}

/**
 * Normalize create/update body: name aliases → mp_client_name, drop empties,
 * keep only known client columns.
 */
export function normalizeClientWritePayload(
  body: Record<string, unknown>,
  options: { requireIdentity?: boolean } = {}
): Record<string, unknown> {
  const requireIdentity = options.requireIdentity !== false
  const { clientname_input, mp_client_name, client_name, ...rest } = body
  const clientName = mp_client_name || client_name || clientname_input
  const merged: Record<string, unknown> = {
    ...rest,
    ...(clientName != null && String(clientName).trim() !== ""
      ? { mp_client_name: String(clientName).trim() }
      : {}),
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue
    if (!(key in WRITABLE_SNAKE_TO_CAMEL) && key !== "id") continue
    if (key === "id") continue
    out[key] = value
  }

  if (requireIdentity) {
    const missing: string[] = []
    if (!out.mp_client_name) missing.push("mp_client_name")
    if (!out.mbaidentifier) missing.push("mbaidentifier")
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`)
    }
  }

  return out
}

export function buildXanoClientMirrorPayload(
  pgId: number,
  snakeRow: Record<string, unknown>
): Record<string, unknown> {
  const name = snakeRow.mp_client_name
  return {
    ...snakeRow,
    id: pgId,
    ...(typeof name === "string"
      ? {
          mp_client_name: name,
          client_name: name,
          clientname_input: name,
        }
      : {}),
  }
}

function snakeToInsertValues(
  snake: Record<string, unknown>
): typeof schema.clients.$inferInsert {
  const values: Record<string, unknown> = {}
  for (const [snakeKey, value] of Object.entries(snake)) {
    const camel = WRITABLE_SNAKE_TO_CAMEL[snakeKey]
    if (!camel) continue
    values[camel] = value
  }
  return values as typeof schema.clients.$inferInsert
}

/** Drop both clients list caches (10min + 30s finance reference). */
export function invalidateAllClientsCaches(): void {
  invalidateClientsCache()
  invalidateCachedClients()
}

/**
 * After ETL explicit-id loads, identity can lag max(id). Advance when behind;
 * never rewind when last_value is already ahead (X9.1).
 */
export async function syncClientsIdSequence(): Promise<void> {
  const db = getDb()
  await db.execute(sql`
    SELECT setval(
      'clients_id_seq',
      GREATEST(
        COALESCE((SELECT MAX(id)::bigint FROM clients), 0),
        (SELECT last_value FROM clients_id_seq)
      ),
      true
    )
  `)
}

export async function persistClientMirrorFailureNotification(
  payload: ClientMirrorFailurePayload
): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return
  try {
    const db = getDb()
    await db.execute(sql`
      INSERT INTO app_notifications (audience, kind, payload)
      VALUES (
        ${CLIENT_MIRROR_FAILURE_AUDIENCE},
        ${CLIENT_MIRROR_FAILURE_KIND},
        ${JSON.stringify(payload)}::jsonb
      )
    `)
  } catch (err) {
    console.warn("[clients-mirror] failed to persist app_notifications row", {
      clientId: payload.clientId,
      err,
    })
  }
}

export type ClientMirrorResult = "ok" | "failed"

async function mirrorClientToXano(input: {
  op: "create" | "update" | "patch"
  clientId: number
  snakeRow: Record<string, unknown>
}): Promise<ClientMirrorResult> {
  const base = getXanoClientsCollectionUrl()
  const timeoutMs = getXanoTimeoutMs()
  const headers = {
    "Content-Type": "application/json",
    ...xanoPostHeaderRecord(),
  }
  const payload = buildXanoClientMirrorPayload(input.clientId, input.snakeRow)

  try {
    if (input.op === "create") {
      const res = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        throw new Error(`Xano POST clients ${res.status}: ${await res.text().catch(() => "")}`)
      }
    } else {
      const method = input.op === "update" ? "PUT" : "PATCH"
      const res = await fetch(`${base}/${encodeURIComponent(String(input.clientId))}`, {
        method,
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        throw new Error(
          `Xano ${method} clients/${input.clientId} ${res.status}: ${await res.text().catch(() => "")}`
        )
      }
    }
    return "ok"
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[clients-mirror] Xano mirror failed", {
      op: input.op,
      clientId: input.clientId,
      message,
    })
    await persistClientMirrorFailureNotification(
      buildClientMirrorFailurePayload({
        op: input.op,
        clientId: input.clientId,
        error: message,
      })
    )
    return "failed"
  }
}

export type ClientWriteResult = {
  row: Record<string, unknown>
  mirror: ClientMirrorResult
}

export async function createClientPostgresFirst(
  body: Record<string, unknown>
): Promise<ClientWriteResult> {
  const snake = normalizeClientWritePayload(body, { requireIdentity: true })
  // Persist dashboard slug on create (unique index). Rename path preserves slug —
  // see updateClientPostgresFirst (does not auto-refresh from mp_client_name).
  if (!snake.slug) {
    const derived = slugifyClientNameForUrl(snake.mp_client_name)
    if (derived) snake.slug = derived
  }
  // Sequence owns allocation on the hot path (X9.1). Use syncClientsIdSequence
  // after ETL / migration only — never rewind via per-insert setval(MAX).
  const db = getDb()
  const mbaId = String(snake.mbaidentifier ?? "").trim()
  if (snake.m365_is_anchor === undefined && mbaId) {
    const siblings = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(
        sql`mbaidentifier IS NOT NULL
          AND btrim(mbaidentifier) <> ''
          AND lower(btrim(mbaidentifier)) = ${mbaId.toLowerCase()}`
      )
      .limit(1)
    snake.m365_is_anchor = siblings.length === 0
  }
  const [inserted] = await db
    .insert(schema.clients)
    .values(snakeToInsertValues(snake))
    .returning()
  if (!inserted?.id) {
    throw new Error("Postgres clients insert returned no id")
  }
  invalidateAllClientsCaches()
  const row = mapClientRowFromPostgres(inserted as Record<string, unknown>)
  const mirror = await mirrorClientToXano({
    op: "create",
    clientId: Number(inserted.id),
    snakeRow: snake,
  })
  return { row, mirror }
}

export async function updateClientPostgresFirst(
  id: string | number,
  body: Record<string, unknown>,
  op: "update" | "patch"
): Promise<ClientWriteResult | { notFound: true }> {
  const numericId = Number(id)
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return { notFound: true }
  }
  // Updates may be partial (same as legacy Xano PUT/PATCH).
  // Rename writes `mp_client_name` here and does NOT refresh `slug` — preserve
  // persisted tenant slug unless the body explicitly includes `slug`.
  // Call sites: PUT/PATCH `app/api/clients/[id]/route.ts` → this function.
  const snake = normalizeClientWritePayload(body, { requireIdentity: false })
  if (Object.keys(snake).length === 0) {
    const [existing] = await getDb()
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, numericId))
      .limit(1)
    if (!existing) return { notFound: true }
    return {
      row: mapClientRowFromPostgres(existing as Record<string, unknown>),
      mirror: "ok",
    }
  }

  const db = getDb()
  const [updated] = await db
    .update(schema.clients)
    .set(snakeToInsertValues(snake))
    .where(eq(schema.clients.id, numericId))
    .returning()
  if (!updated) return { notFound: true }

  invalidateAllClientsCaches()
  const row = mapClientRowFromPostgres(updated as Record<string, unknown>)
  const mirror = await mirrorClientToXano({
    op,
    clientId: numericId,
    snakeRow: snake,
  })
  return { row, mirror }
}

export type ResolveClientIdLookup = {
  findById: (id: number) => Promise<{ id: number } | null>
  findByName: (name: string) => Promise<{ id: number } | null>
}

/** Resolve media_plan_masters.client_id from PG clients at save time. */
export async function resolveClientIdForMaster(
  input: { clientId?: number | null; mpClientName?: string | null },
  lookup?: ResolveClientIdLookup
): Promise<number | null> {
  const findById =
    lookup?.findById ??
    (async (id: number) => {
      const [row] = await getDb()
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(eq(schema.clients.id, id))
        .limit(1)
      return row?.id != null ? { id: Number(row.id) } : null
    })
  const findByName =
    lookup?.findByName ??
    (async (name: string) => {
      const [row] = await getDb()
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(sql`lower(trim(${schema.clients.mpClientName})) = ${name.trim().toLowerCase()}`)
        .limit(1)
      return row?.id != null ? { id: Number(row.id) } : null
    })

  const explicit =
    typeof input.clientId === "number" &&
    Number.isFinite(input.clientId) &&
    input.clientId > 0
      ? input.clientId
      : null
  if (explicit != null) {
    const hit = await findById(explicit)
    if (hit) return hit.id
  }
  const name = typeof input.mpClientName === "string" ? input.mpClientName.trim() : ""
  if (name) {
    const hit = await findByName(name)
    if (hit) return hit.id
  }
  return null
}
