/**
 * Postgres-backed Fireflies sync (cron entrypoint).
 */
import "server-only"

import { and, desc, eq, isNull } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { DEFAULT_ASSEMBLED_DOMAINS } from "@/lib/fireflies/attribution"
import { defaultAssembledDomainSet } from "@/lib/fireflies/internalDomains"
import {
  collectSeedDomainPairs,
  type SeedClientRow,
} from "@/lib/fireflies/seedDomains"
import { insertProposalsFromNote } from "@/lib/fireflies/proposalRepo"
import { runFirefliesSync, type SyncInsertNote } from "@/lib/fireflies/sync"
import type { AttributionContext, KnownMba } from "@/lib/fireflies/types"

async function loadCursor(database = getDb()): Promise<string | null> {
  const [row] = await database
    .select({ cursorFrom: schema.firefliesSyncState.cursorFrom })
    .from(schema.firefliesSyncState)
    .where(eq(schema.firefliesSyncState.status, "ok"))
    .orderBy(desc(schema.firefliesSyncState.id))
    .limit(1)
  return row?.cursorFrom ?? null
}

async function loadAttributionContext(
  database = getDb()
): Promise<AttributionContext> {
  const masters = await database
    .select({
      mbaNumber: schema.mediaPlanMasters.mbaNumber,
      clientId: schema.mediaPlanMasters.clientId,
    })
    .from(schema.mediaPlanMasters)

  const knownMbas = new Map<string, KnownMba>()
  for (const m of masters) {
    const mba = (m.mbaNumber ?? "").trim()
    if (!mba) continue
    knownMbas.set(mba.toLowerCase(), {
      mbaNumber: mba,
      clientId: m.clientId ?? null,
    })
  }

  const domains = await database
    .select({
      clientId: schema.clientDomains.clientId,
      emailDomain: schema.clientDomains.emailDomain,
    })
    .from(schema.clientDomains)

  const domainToClient = new Map<string, number>()
  for (const d of domains) {
    if (d.clientId == null || !d.emailDomain) continue
    domainToClient.set(d.emailDomain.trim().toLowerCase(), d.clientId)
  }

  return {
    knownMbas,
    domainToClient,
    assembledDomains: defaultAssembledDomainSet(),
  }
}

export async function seedClientDomainsFromClients(
  database = getDb()
): Promise<{ upserted: number }> {
  const assembled = defaultAssembledDomainSet()
  const clients = (await database
    .select({
      id: schema.clients.id,
      keyemail: schema.clients.keyemail,
      billingemail: schema.clients.billingemail,
      website: schema.clients.website,
    })
    .from(schema.clients)) as SeedClientRow[]

  const pairs = collectSeedDomainPairs(clients, assembled)
  let upserted = 0
  for (const pair of pairs) {
    const existing = await database
      .select({ id: schema.clientDomains.id })
      .from(schema.clientDomains)
      .where(
        and(
          eq(schema.clientDomains.clientId, pair.clientId),
          eq(schema.clientDomains.emailDomain, pair.emailDomain)
        )
      )
      .limit(1)
    if (existing.length > 0) continue
    await database.insert(schema.clientDomains).values({
      clientId: pair.clientId,
      emailDomain: pair.emailDomain,
    })
    upserted += 1
  }
  return { upserted }
}

export async function runFirefliesSyncToPostgres(): Promise<{
  status: "ok" | "error"
  meetingsSeen: number
  notesCreated: number
  notesSkipped: number
  unmatched: number
  proposalsCreated?: number
  cursorFrom: string | null
  domainsSeeded: number
  error?: string
}> {
  const database = getDb()
  const { upserted: domainsSeeded } =
    await seedClientDomainsFromClients(database)

  const apiKey = process.env.FIREFLIES_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("FIREFLIES_API_KEY is not set")
  }

  const result = await runFirefliesSync({
    getApiKey: () => apiKey,
    loadCursor: () => loadCursor(database),
    loadAttributionContext: () => loadAttributionContext(database),
    hasMeeting: async (id) => {
      const [row] = await database
        .select({ id: schema.clientNotes.id })
        .from(schema.clientNotes)
        .where(eq(schema.clientNotes.firefliesMeetingId, id))
        .limit(1)
      return row != null
    },
    insertNote: async (note: SyncInsertNote) => {
      const [row] = await database
        .insert(schema.clientNotes)
        .values({
          clientId: note.clientId,
          mbaNumber: note.mbaNumber,
          source: note.source,
          title: note.title,
          body: note.body,
          meetingDate: note.meetingDate,
          firefliesMeetingId: note.firefliesMeetingId,
          participants: note.participants,
          organizerEmail: note.organizerEmail,
          matchedBy: note.matchedBy,
          durationSeconds: note.durationSeconds,
          transcriptUrl: note.transcriptUrl,
          isInternal: note.isInternal,
        })
        .returning({ id: schema.clientNotes.id })
      if (!row?.id) throw new Error("client_notes insert returned no id")
      return { id: row.id }
    },
    insertProposalsFromNote: async ({ noteId, note }) =>
      insertProposalsFromNote({ noteId, note }, database),
    saveRun: async (row) => {
      await database.insert(schema.firefliesSyncState).values({
        runStartedAt: new Date().toISOString(),
        runFinishedAt: new Date().toISOString(),
        cursorFrom: row.cursorFrom,
        meetingsSeen: row.meetingsSeen,
        notesCreated: row.notesCreated,
        notesSkipped: row.notesSkipped,
        unmatched: row.unmatched,
        status: row.status,
        error: row.error ?? null,
      })
    },
  })

  return { ...result, domainsSeeded }
}

export async function listUnattributedFirefliesNotes(
  database = getDb()
) {
  return database
    .select()
    .from(schema.clientNotes)
    .where(
      and(
        eq(schema.clientNotes.source, "fireflies"),
        isNull(schema.clientNotes.clientId),
        eq(schema.clientNotes.isInternal, false)
      )
    )
    .orderBy(desc(schema.clientNotes.meetingDate), desc(schema.clientNotes.id))
}

export async function assignFirefliesNote(
  noteId: number,
  clientId: number,
  database = getDb()
) {
  const { applyManualAssignment } = await import("@/lib/fireflies/assign")
  const assembled = defaultAssembledDomainSet()

  return applyManualAssignment(
    { noteId, clientId },
    {
      assembledDomains: assembled,
      getNote: async (id) => {
        const [row] = await database
          .select()
          .from(schema.clientNotes)
          .where(eq(schema.clientNotes.id, id))
          .limit(1)
        if (!row) return null
        return {
          id: row.id,
          clientId: row.clientId,
          matchedBy: row.matchedBy,
          participants: row.participants,
          isInternal: row.isInternal,
        }
      },
      updateNoteClient: async (id, cid, matchedBy) => {
        await database
          .update(schema.clientNotes)
          .set({ clientId: cid, matchedBy })
          .where(eq(schema.clientNotes.id, id))
      },
      upsertClientDomain: async (cid, domain) => {
        const [existing] = await database
          .select({ id: schema.clientDomains.id })
          .from(schema.clientDomains)
          .where(
            and(
              eq(schema.clientDomains.clientId, cid),
              eq(schema.clientDomains.emailDomain, domain)
            )
          )
          .limit(1)
        if (existing) return
        await database.insert(schema.clientDomains).values({
          clientId: cid,
          emailDomain: domain,
        })
      },
      listUnattributed: async () => {
        const rows = await listUnattributedFirefliesNotes(database)
        return rows.map((row) => ({
          id: row.id,
          clientId: row.clientId,
          matchedBy: row.matchedBy,
          participants: row.participants,
          isInternal: row.isInternal,
        }))
      },
    }
  )
}

/** Exported for seed report / admin diagnostics. */
export { DEFAULT_ASSEMBLED_DOMAINS, collectSeedDomainPairs }
