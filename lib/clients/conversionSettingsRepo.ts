import "server-only"

import { and, asc, eq, isNotNull, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { clientConversionEvents, clientConversionSettings, clients } from "@/db/schema"
import { mbaNumberMatchesClientIdentifier } from "@/lib/auth/mbaNumberMatchesClientIdentifier"
import {
  DEFAULT_CONVERSION_SETTINGS,
  isConversionCategory,
  isConversionHeadline,
  isConversionPlatform,
  type ConversionEventChoice,
  type ConversionSettings,
} from "@/lib/delivery/conversions/rules"

/** Tables from migration 0103 are missing (not applied yet). */
export class ConversionSettingsNotReadyError extends Error {
  readonly code = "CONVERSION_SETTINGS_NOT_READY"
  constructor() {
    super("client_conversion_settings does not exist")
    this.name = "ConversionSettingsNotReadyError"
  }
}

export type ClientConversionConfig = {
  clientId: number
  settings: ConversionSettings
  events: ConversionEventChoice[]
}

function errorBlob(err: unknown): string {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object" && current) {
      const row = current as { code?: unknown; message?: unknown; cause?: unknown }
      if (row.code != null) parts.push(String(row.code))
      if (row.message != null) parts.push(String(row.message))
      current = row.cause
    } else {
      parts.push(String(current))
      current = null
    }
  }
  return parts.join(" ")
}

export function isMissingConversionTable(err: unknown): boolean {
  const blob = errorBlob(err)
  return blob.includes("42P01") || (/client_conversion_(settings|events)/i.test(blob) && /does not exist/i.test(blob))
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ConversionSettingsNotReadyError) throw err
    if (isMissingConversionTable(err)) throw new ConversionSettingsNotReadyError()
    throw err
  }
}

function toChoice(row: typeof clientConversionEvents.$inferSelect): ConversionEventChoice | null {
  if (!isConversionPlatform(row.platform) || !isConversionCategory(row.category)) return null
  return {
    platform: row.platform,
    eventKey: row.eventKey,
    label: row.label,
    category: row.category,
    includeValue: row.includeValue,
  }
}

export async function readClientConversionConfig(clientId: number): Promise<ClientConversionConfig> {
  return guard(async () => {
    const db = getDb()
    const [settingsRow] = await db
      .select()
      .from(clientConversionSettings)
      .where(eq(clientConversionSettings.clientId, clientId))
      .limit(1)
    const eventRows = await db
      .select()
      .from(clientConversionEvents)
      .where(and(eq(clientConversionEvents.clientId, clientId), eq(clientConversionEvents.active, true)))
      .orderBy(asc(clientConversionEvents.platform), asc(clientConversionEvents.eventKey))
    return {
      clientId,
      settings: settingsRow
        ? {
            enabled: settingsRow.enabled,
            headline: isConversionHeadline(settingsRow.headline) ? settingsRow.headline : "conversions",
            showRevenue: settingsRow.showRevenue,
          }
        : { ...DEFAULT_CONVERSION_SETTINGS },
      events: eventRows.map(toChoice).filter((c): c is ConversionEventChoice => c != null),
    }
  })
}

/**
 * Saves the switch and the chosen events. Events not in the list are set
 * inactive (kept for history). Caller validates with conversionEventProblems.
 */
export async function saveClientConversionConfig(input: {
  clientId: number
  settings: ConversionSettings
  events: readonly ConversionEventChoice[]
  updatedBy: string | null
}): Promise<ClientConversionConfig> {
  await guard(async () => {
    const db = getDb()
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx
        .insert(clientConversionSettings)
        .values({
          clientId: input.clientId,
          enabled: input.settings.enabled,
          headline: input.settings.headline,
          showRevenue: input.settings.showRevenue,
          updatedAt: now,
          updatedBy: input.updatedBy,
        })
        .onConflictDoUpdate({
          target: clientConversionSettings.clientId,
          set: {
            enabled: input.settings.enabled,
            headline: input.settings.headline,
            showRevenue: input.settings.showRevenue,
            updatedAt: now,
            updatedBy: input.updatedBy,
          },
        })

      await tx
        .update(clientConversionEvents)
        .set({ active: false, updatedAt: now, updatedBy: input.updatedBy })
        .where(and(eq(clientConversionEvents.clientId, input.clientId), eq(clientConversionEvents.active, true)))

      for (const event of input.events) {
        await tx
          .insert(clientConversionEvents)
          .values({
            clientId: input.clientId,
            platform: event.platform,
            eventKey: event.eventKey,
            label: event.label,
            category: event.category,
            includeValue: event.includeValue,
            active: true,
            createdBy: input.updatedBy,
            updatedAt: now,
            updatedBy: input.updatedBy,
          })
          .onConflictDoUpdate({
            target: [clientConversionEvents.clientId, clientConversionEvents.platform, clientConversionEvents.eventKey],
            set: {
              label: event.label,
              category: event.category,
              includeValue: event.includeValue,
              active: true,
              updatedAt: now,
              updatedBy: input.updatedBy,
            },
          })
      }
    })
  })
  return readClientConversionConfig(input.clientId)
}

/**
 * Client ids whose mbaidentifier matches the MBA (identifier + digits),
 * lowest id first. Client groups can share one identifier.
 */
export async function clientIdsForMba(mbaNumber: string): Promise<number[]> {
  const mba = mbaNumber.trim()
  if (!mba) return []
  const db = getDb()
  const rows = await db
    .select({ id: clients.id, mbaidentifier: clients.mbaidentifier })
    .from(clients)
    .where(
      and(
        isNotNull(clients.mbaidentifier),
        sql`lower(${mba}) like lower(trim(${clients.mbaidentifier})) || '%'`,
      ),
    )
    .orderBy(asc(clients.id))
  return rows
    .filter((r) => mbaNumberMatchesClientIdentifier(mba, r.mbaidentifier))
    .map((r) => Number(r.id))
    .filter((id) => Number.isInteger(id) && id > 0)
}

/**
 * The conversion config for the client that owns an MBA. When several client
 * rows share the identifier, the first with an enabled switch wins, then the
 * first with any settings row. Missing tables read as switched off.
 */
export async function readConversionConfigForMba(mbaNumber: string): Promise<ClientConversionConfig | null> {
  const ids = await clientIdsForMba(mbaNumber)
  if (ids.length === 0) return null
  try {
    const configs = await Promise.all(ids.map((id) => readClientConversionConfig(id)))
    return configs.find((c) => c.settings.enabled) ?? configs[0] ?? null
  } catch (err) {
    if (err instanceof ConversionSettingsNotReadyError) return null
    throw err
  }
}
