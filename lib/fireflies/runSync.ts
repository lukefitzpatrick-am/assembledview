/**
 * Postgres-backed Fireflies sync (cron entrypoint).
 */
import "server-only"

import { and, desc, eq, isNull } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { DEFAULT_ASSEMBLED_DOMAINS } from "@/lib/fireflies/attribution"
import {
  buildAssignTargetOptions,
  publisherEligibleForAssign,
} from "@/lib/fireflies/assignTargets"
import type { AssignTarget } from "@/lib/fireflies/assign"
import { defaultAssembledDomainSet } from "@/lib/fireflies/internalDomains"
import {
  collectSeedDomainPairs,
  type SeedClientRow,
} from "@/lib/fireflies/seedDomains"
import { parseEmailAliases } from "@/lib/fireflies/rosterAliases"
import { insertProposalsFromNote } from "@/lib/fireflies/proposalRepo"
import { runFirefliesSync, type SyncInsertNote } from "@/lib/fireflies/sync"
import { buildTitleClientIndex } from "@/lib/fireflies/titleClients"
import type {
  AttributionContext,
  KnownMba,
  TitleRuleTarget,
} from "@/lib/fireflies/types"
import { upsertTimeEntryDraftsForNote } from "@/lib/myhours/proposalRepo"

async function loadCursor(database = getDb()): Promise<string | null> {
  const [row] = await database
    .select({ cursorFrom: schema.firefliesSyncState.cursorFrom })
    .from(schema.firefliesSyncState)
    .where(eq(schema.firefliesSyncState.status, "ok"))
    .orderBy(desc(schema.firefliesSyncState.id))
    .limit(1)
  return row?.cursorFrom ?? null
}

export async function loadAttributionContext(
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

  const clientRows = await database
    .select({
      id: schema.clients.id,
      mpClientName: schema.clients.mpClientName,
      mbaidentifier: schema.clients.mbaidentifier,
      clientNameAliases: schema.clients.clientNameAliases,
      m365IsAnchor: schema.clients.m365IsAnchor,
    })
    .from(schema.clients)

  const titleClients = buildTitleClientIndex(
    clientRows.map((row) => ({
      clientId: row.id,
      displayName: (row.mpClientName ?? "").trim() || `Client ${row.id}`,
      mbaidentifier: row.mbaidentifier,
      aliases: parseEmailAliases(row.clientNameAliases),
      isAnchor: Boolean(row.m365IsAnchor),
    }))
  )

  const rosterRows = await database
    .select({
      email: schema.teamMembers.email,
      name: schema.teamMembers.name,
      emailAliases: schema.teamMembers.emailAliases,
      active: schema.teamMembers.active,
    })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.active, true))

  const roster = rosterRows.map((row) => ({
    canonicalEmail: row.email.trim().toLowerCase(),
    name: row.name,
    aliases: parseEmailAliases(row.emailAliases),
  }))

  const publisherDomainRows = await database
    .select({
      publisherId: schema.publisherDomains.publisherId,
      emailDomain: schema.publisherDomains.emailDomain,
    })
    .from(schema.publisherDomains)

  const domainToPublisher = new Map<string, number>()
  for (const d of publisherDomainRows) {
    if (d.publisherId == null || !d.emailDomain) continue
    domainToPublisher.set(d.emailDomain.trim().toLowerCase(), d.publisherId)
  }

  const titleRuleRows = await database
    .select({
      normalizedTitle: schema.meetingTitleRules.normalizedTitle,
      targetType: schema.meetingTitleRules.targetType,
    })
    .from(schema.meetingTitleRules)

  const titleRules = new Map<string, TitleRuleTarget>()
  for (const row of titleRuleRows) {
    const title = (row.normalizedTitle ?? "").trim()
    if (
      title &&
      (row.targetType === "internal" || row.targetType === "new_business")
    ) {
      titleRules.set(title, row.targetType)
    }
  }

  return {
    knownMbas,
    domainToClient,
    domainToPublisher,
    titleRules,
    assembledDomains: defaultAssembledDomainSet(),
    titleClients,
    roster,
  }
}

export async function loadLatestFirefliesSync(database = getDb()) {
  const [row] = await database
    .select({
      cursorFrom: schema.firefliesSyncState.cursorFrom,
      meetingsSeen: schema.firefliesSyncState.meetingsSeen,
      notesCreated: schema.firefliesSyncState.notesCreated,
      unmatched: schema.firefliesSyncState.unmatched,
      status: schema.firefliesSyncState.status,
      runFinishedAt: schema.firefliesSyncState.runFinishedAt,
      error: schema.firefliesSyncState.error,
    })
    .from(schema.firefliesSyncState)
    .orderBy(desc(schema.firefliesSyncState.id))
    .limit(1)
  return row ?? null
}

async function loadActiveTeamMemberEmails(
  database = getDb()
): Promise<string[]> {
  const rows = await database
    .select({ email: schema.teamMembers.email })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.active, true))

  return [
    ...new Set(
      rows
        .map((row) => row.email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
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

export async function runFirefliesSyncToPostgres(opts?: {
  lookbackDays?: number
}): Promise<{
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
  const activeMemberEmails = await loadActiveTeamMemberEmails(database)

  const apiKey = process.env.FIREFLIES_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("FIREFLIES_API_KEY is not set")
  }

  const result = await runFirefliesSync({
    getApiKey: () => apiKey,
    loadCursor: () => loadCursor(database),
    lookbackDays: opts?.lookbackDays,
    loadAttributionContext: () => loadAttributionContext(database),
    hasMeeting: async (id) => {
      const [row] = await database
        .select()
        .from(schema.clientNotes)
        .where(eq(schema.clientNotes.firefliesMeetingId, id))
        .limit(1)
      if (!row) return false
      return {
        id: row.id,
        note: {
          firefliesMeetingId: row.firefliesMeetingId ?? id,
          clientId: row.clientId,
          mbaNumber: row.mbaNumber,
          source: "fireflies",
          title: row.title,
          body: row.body,
          meetingDate: row.meetingDate,
          participants: row.participants,
          organizerEmail: row.organizerEmail,
          matchedBy: row.matchedBy,
          durationSeconds: row.durationSeconds,
          transcriptUrl: row.transcriptUrl,
          isInternal: row.isInternal,
          attributedType: row.attributedType ?? null,
          publisherId: row.publisherId ?? null,
          actionItemsRaw: null,
        },
      }
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
          attributedType: note.attributedType ?? null,
          publisherId: note.publisherId ?? null,
        })
        .returning({ id: schema.clientNotes.id })
      if (!row?.id) throw new Error("client_notes insert returned no id")
      return { id: row.id }
    },
    insertProposalsFromNote: async ({ noteId, note }) =>
      insertProposalsFromNote({ noteId, note }, database),
    activeMemberEmails,
    upsertTimeEntryDraftsForNote: ({ noteId, note, activeMemberEmails }) =>
      upsertTimeEntryDraftsForNote(
        { noteId, note, activeMemberEmails },
        database
      ),
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

export type FirefliesNotesFilter =
  | "unattributed"
  | "publisher"
  | "internal"
  | "new_business"

export async function listFirefliesNotes(
  filter: FirefliesNotesFilter = "unattributed",
  database = getDb()
) {
  const typeFilter =
    filter === "unattributed"
      ? isNull(schema.clientNotes.attributedType)
      : eq(schema.clientNotes.attributedType, filter)
  return database
    .select()
    .from(schema.clientNotes)
    .where(and(eq(schema.clientNotes.source, "fireflies"), typeFilter))
    .orderBy(desc(schema.clientNotes.meetingDate), desc(schema.clientNotes.id))
}

export async function listUnattributedFirefliesNotes(
  database = getDb()
) {
  return listFirefliesNotes("unattributed", database)
}

export async function loadAssignTargets(database = getDb()) {
  const [clients, publishers] = await Promise.all([
    database
      .select({
        id: schema.clients.id,
        mpClientName: schema.clients.mpClientName,
        mbaidentifier: schema.clients.mbaidentifier,
      })
      .from(schema.clients),
    database
      .select({
        id: schema.publishers.id,
        publisherName: schema.publishers.publisherName,
      })
      .from(schema.publishers),
  ])
  return buildAssignTargetOptions({ clients, publishers })
}

export async function publisherExistsForAssign(
  publisherId: number,
  database = getDb()
): Promise<boolean> {
  if (!publisherEligibleForAssign(publisherId)) return false
  const [row] = await database
    .select({ id: schema.publishers.id })
    .from(schema.publishers)
    .where(eq(schema.publishers.id, publisherId))
    .limit(1)
  return row != null
}

export async function assignFirefliesNote(
  noteId: number,
  target: AssignTarget,
  opts?: { createdBy?: string | null },
  database = getDb()
) {
  const { applyManualAssignment } = await import("@/lib/fireflies/assign")
  const assembled = defaultAssembledDomainSet()
  const clientDomainRows = await database
    .select({ emailDomain: schema.clientDomains.emailDomain })
    .from(schema.clientDomains)
  const clientDomains = new Set(
    clientDomainRows
      .map((r) => (r.emailDomain ?? "").trim().toLowerCase())
      .filter(Boolean)
  )

  return applyManualAssignment(
    { noteId, target },
    {
      assembledDomains: assembled,
      createdBy: opts?.createdBy ?? null,
      clientDomainSet: () => clientDomains,
      getNote: async (id) => {
        const [row] = await database
          .select()
          .from(schema.clientNotes)
          .where(eq(schema.clientNotes.id, id))
          .limit(1)
        if (!row) return null
        return {
          id: row.id,
          title: row.title,
          clientId: row.clientId,
          publisherId: row.publisherId,
          attributedType: row.attributedType,
          matchedBy: row.matchedBy,
          participants: row.participants,
          isInternal: row.isInternal,
        }
      },
      updateNote: async (id, patch) => {
        await database
          .update(schema.clientNotes)
          .set({
            clientId: patch.clientId ?? null,
            publisherId: patch.publisherId ?? null,
            attributedType: patch.attributedType,
            matchedBy: patch.matchedBy,
            isInternal: patch.isInternal,
          })
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
        clientDomains.add(domain)
      },
      upsertPublisherDomain: async (pid, domain) => {
        const [existing] = await database
          .select({ id: schema.publisherDomains.id })
          .from(schema.publisherDomains)
          .where(eq(schema.publisherDomains.emailDomain, domain))
          .limit(1)
        if (existing) return
        await database.insert(schema.publisherDomains).values({
          publisherId: pid,
          emailDomain: domain,
        })
      },
      upsertTitleRule: async (normalizedTitle, targetType, createdBy) => {
        await database
          .insert(schema.meetingTitleRules)
          .values({
            normalizedTitle,
            targetType,
            createdBy: createdBy ?? null,
          })
          .onConflictDoUpdate({
            target: schema.meetingTitleRules.normalizedTitle,
            set: {
              targetType,
              createdBy: createdBy ?? null,
            },
          })
      },
      listUnattributed: async () => {
        const rows = await listUnattributedFirefliesNotes(database)
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          clientId: row.clientId,
          publisherId: row.publisherId,
          attributedType: row.attributedType,
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
