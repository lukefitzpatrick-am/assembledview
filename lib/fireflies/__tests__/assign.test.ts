import assert from "node:assert/strict"
import { test } from "node:test"

import { applyManualAssignment } from "../assign.js"
import { attributeMeeting } from "../attribution.js"
import { runFirefliesSync } from "../sync.js"
import { normaliseAttributionText } from "../titleClients.js"
import type { AttributionContext } from "../types.js"
import type { FirefliesTranscript } from "../types.js"

const ASSEMBLED = new Set(["assembledmedia.com.au"])

type NoteRow = {
  id: number
  title: string | null
  clientId: number | null
  publisherId: number | null
  attributedType: string | null
  matchedBy: string | null
  participants: string
  isInternal: boolean
}

function noteRow(
  id: number,
  over: Partial<NoteRow> = {}
): NoteRow {
  return {
    id,
    title: null,
    clientId: null,
    publisherId: null,
    attributedType: null,
    matchedBy: null,
    participants: "[]",
    isInternal: false,
    ...over,
  }
}

function makeAssignDeps(notes: Map<number, NoteRow>) {
  const clientDomains = new Map<string, number>()
  const publisherDomains = new Map<string, number>()
  const titleRules = new Map<string, "internal" | "new_business">()

  return {
    clientDomains,
    publisherDomains,
    titleRules,
    deps: {
      assembledDomains: ASSEMBLED,
      clientDomainSet: () => new Set(clientDomains.keys()),
      getNote: async (id: number) => notes.get(id) ?? null,
      updateNote: async (
        id: number,
        patch: {
          clientId?: number | null
          publisherId?: number | null
          attributedType: "client" | "publisher" | "internal" | "new_business"
          matchedBy: string
          isInternal: boolean
        }
      ) => {
        const n = notes.get(id)!
        if ("clientId" in patch) n.clientId = patch.clientId ?? null
        if ("publisherId" in patch) n.publisherId = patch.publisherId ?? null
        n.attributedType = patch.attributedType
        n.matchedBy = patch.matchedBy
        n.isInternal = patch.isInternal
      },
      upsertClientDomain: async (clientId: number, domain: string) => {
        clientDomains.set(domain, clientId)
      },
      upsertPublisherDomain: async (publisherId: number, domain: string) => {
        publisherDomains.set(domain, publisherId)
      },
      upsertTitleRule: async (
        normalizedTitle: string,
        targetType: "internal" | "new_business"
      ) => {
        titleRules.set(normalizedTitle, targetType)
      },
      listUnattributed: async () =>
        [...notes.values()].filter((n) => n.attributedType == null),
    },
  }
}

test("client assign sets client columns and learns the external domain", async () => {
  const notes = new Map([
    [
      1,
      noteRow(1, {
        participants: JSON.stringify([
          "luke@assembledmedia.com.au",
          "jane@acme.com",
        ]),
      }),
    ],
    [
      2,
      noteRow(2, {
        participants: JSON.stringify(["other@acme.com"]),
      }),
    ],
  ])
  const { clientDomains, deps } = makeAssignDeps(notes)

  const result = await applyManualAssignment(
    { noteId: 1, target: { type: "client", clientId: 77 } },
    deps
  )

  assert.equal(result.ok, true)
  assert.equal(notes.get(1)!.clientId, 77)
  assert.equal(notes.get(1)!.attributedType, "client")
  assert.equal(notes.get(1)!.matchedBy, "manual")
  assert.equal(notes.get(1)!.publisherId, null)
  assert.equal(notes.get(1)!.isInternal, false)
  assert.equal(clientDomains.get("acme.com"), 77)
  assert.equal(notes.get(2)!.clientId, 77)
  assert.equal(notes.get(2)!.attributedType, "client")
  assert.equal(notes.get(2)!.matchedBy, "domain")
})

test("publisher assign sets publisher columns and learns the domain", async () => {
  const notes = new Map([
    [
      1,
      noteRow(1, {
        participants: JSON.stringify([
          "luke@assembledmedia.com.au",
          "ops@nine.com.au",
        ]),
      }),
    ],
  ])
  const { publisherDomains, deps } = makeAssignDeps(notes)

  const result = await applyManualAssignment(
    { noteId: 1, target: { type: "publisher", publisherId: 11 } },
    deps
  )

  assert.equal(result.ok, true)
  assert.equal(notes.get(1)!.publisherId, 11)
  assert.equal(notes.get(1)!.attributedType, "publisher")
  assert.equal(notes.get(1)!.clientId, null)
  assert.equal(notes.get(1)!.isInternal, false)
  assert.equal(publisherDomains.get("nine.com.au"), 11)
})

test("internal assign sets internal columns and upserts a title rule (no domain learn)", async () => {
  const notes = new Map([
    [
      1,
      noteRow(1, {
        title: "Monday standup",
        participants: JSON.stringify([
          "luke@assembledmedia.com.au",
          "partner@otheragency.com",
        ]),
      }),
    ],
  ])
  const { clientDomains, publisherDomains, titleRules, deps } =
    makeAssignDeps(notes)

  const result = await applyManualAssignment(
    { noteId: 1, target: { type: "internal" } },
    deps
  )

  assert.equal(result.ok, true)
  assert.equal(notes.get(1)!.attributedType, "internal")
  assert.equal(notes.get(1)!.isInternal, true)
  assert.equal(notes.get(1)!.clientId, null)
  assert.equal(notes.get(1)!.publisherId, null)
  assert.equal(
    titleRules.get(normaliseAttributionText("Monday standup")),
    "internal"
  )
  assert.equal(clientDomains.size, 0)
  assert.equal(publisherDomains.size, 0)
})

test("new_business assign upserts a title rule and does not learn the prospect domain", async () => {
  const notes = new Map([
    [
      1,
      noteRow(1, {
        title: "Prospect intro — Riviera",
        participants: JSON.stringify([
          "luke@assembledmedia.com.au",
          "ceo@riviera.example",
        ]),
      }),
    ],
  ])
  const { clientDomains, publisherDomains, titleRules, deps } =
    makeAssignDeps(notes)

  const result = await applyManualAssignment(
    { noteId: 1, target: { type: "new_business" } },
    deps
  )

  assert.equal(result.ok, true)
  assert.equal(notes.get(1)!.attributedType, "new_business")
  assert.equal(notes.get(1)!.isInternal, false)
  assert.equal(notes.get(1)!.clientId, null)
  assert.equal(
    titleRules.get(normaliseAttributionText("Prospect intro — Riviera")),
    "new_business"
  )
  assert.equal(clientDomains.size, 0)
  assert.equal(publisherDomains.size, 0)
})

test("free-mail and roster domains are never learned on client or publisher assign", async () => {
  const notes = new Map([
    [
      1,
      noteRow(1, {
        participants: JSON.stringify([
          "luke@assembledmedia.com.au",
          "jane@gmail.com",
        ]),
      }),
    ],
    [
      2,
      noteRow(2, {
        participants: JSON.stringify([
          "luke@assembledmedia.com.au",
          "ops@nine.com.au",
          "temp@hotmail.com",
        ]),
      }),
    ],
  ])
  const { clientDomains, publisherDomains, deps } = makeAssignDeps(notes)

  await applyManualAssignment(
    { noteId: 1, target: { type: "client", clientId: 77 } },
    deps
  )
  await applyManualAssignment(
    { noteId: 2, target: { type: "publisher", publisherId: 11 } },
    deps
  )

  assert.equal(clientDomains.has("gmail.com"), false)
  assert.equal(clientDomains.has("assembledmedia.com.au"), false)
  assert.equal(publisherDomains.has("hotmail.com"), false)
  assert.equal(publisherDomains.has("assembledmedia.com.au"), false)
  assert.equal(publisherDomains.get("nine.com.au"), 11)
})

test("publisher assign does not learn a domain already in client_domains", async () => {
  const notes = new Map([
    [
      1,
      noteRow(1, {
        participants: JSON.stringify(["ops@acme.com"]),
      }),
    ],
  ])
  const { clientDomains, publisherDomains, deps } = makeAssignDeps(notes)
  clientDomains.set("acme.com", 77)

  await applyManualAssignment(
    { noteId: 1, target: { type: "publisher", publisherId: 11 } },
    deps
  )

  assert.equal(publisherDomains.has("acme.com"), false)
  assert.equal(notes.get(1)!.attributedType, "publisher")
})

test("publisher domain learned on assign → next sync auto-attributes that domain as publisher", async () => {
  const notes = new Map([
    [
      1,
      noteRow(1, {
        participants: JSON.stringify(["ops@nine.com.au"]),
      }),
    ],
  ])
  const { publisherDomains, deps } = makeAssignDeps(notes)
  await applyManualAssignment(
    { noteId: 1, target: { type: "publisher", publisherId: 11 } },
    deps
  )

  const inserted: Array<{
    attributedType: string | null
    publisherId: number | null
    clientId: number | null
  }> = []

  const transcript: FirefliesTranscript = {
    id: "ff-nine-next",
    title: "Inventory review",
    date: new Date("2026-08-12T10:00:00.000Z").getTime(),
    duration: 30,
    participants: ["luke@assembledmedia.com.au", "sales@nine.com.au"],
    organizer_email: "luke@assembledmedia.com.au",
    transcript_url: null,
    summary: { overview: "hi", action_items: null },
  }

  await runFirefliesSync({
    getApiKey: () => "test-key",
    loadCursor: async () => null,
    saveRun: async () => {},
    hasMeeting: async () => false,
    insertNote: async (note) => {
      inserted.push({
        attributedType: note.attributedType ?? null,
        publisherId: note.publisherId ?? null,
        clientId: note.clientId,
      })
      return { id: 99 }
    },
    loadAttributionContext: async (): Promise<AttributionContext> => ({
      knownMbas: new Map(),
      domainToClient: new Map(),
      domainToPublisher: publisherDomains,
      titleRules: new Map(),
      assembledDomains: ASSEMBLED,
      titleClients: [],
    }),
    listTranscripts: async () => [transcript],
  })

  assert.deepEqual(inserted, [
    { attributedType: "publisher", publisherId: 11, clientId: null },
  ])
})

test("title rule from an internal assign auto-attributes the next occurrence of the series", async () => {
  const notes = new Map([
    [
      1,
      noteRow(1, {
        title: "Assembled weekly standup",
        participants: JSON.stringify(["luke@assembledmedia.com.au"]),
      }),
    ],
  ])
  const { titleRules, deps } = makeAssignDeps(notes)
  await applyManualAssignment({ noteId: 1, target: { type: "internal" } }, deps)

  const inserted: Array<{
    attributedType: string | null
    isInternal: boolean
    firefliesMeetingId: string
  }> = []

  const transcript: FirefliesTranscript = {
    id: "ff-standup-next",
    title: "Assembled weekly standup",
    date: new Date("2026-08-19T10:00:00.000Z").getTime(),
    duration: 30,
    participants: ["a@assembledmedia.com.au", "guest@otheragency.com"],
    organizer_email: "a@assembledmedia.com.au",
    transcript_url: null,
    summary: { overview: "hi", action_items: null },
  }

  await runFirefliesSync({
    getApiKey: () => "test-key",
    loadCursor: async () => null,
    saveRun: async () => {},
    hasMeeting: async () => false,
    insertNote: async (note) => {
      inserted.push({
        attributedType: note.attributedType ?? null,
        isInternal: note.isInternal,
        firefliesMeetingId: note.firefliesMeetingId,
      })
      return { id: 100 }
    },
    loadAttributionContext: async (): Promise<AttributionContext> => ({
      knownMbas: new Map(),
      domainToClient: new Map(),
      domainToPublisher: new Map(),
      titleRules,
      assembledDomains: ASSEMBLED,
      titleClients: [],
    }),
    listTranscripts: async () => [transcript],
  })

  assert.equal(inserted.length, 1)
  assert.equal(inserted[0]!.firefliesMeetingId, "ff-standup-next")
  assert.equal(inserted[0]!.attributedType, "internal")
  assert.equal(inserted[0]!.isInternal, true)
})

test("CLIENT BEATS PUBLISHER when both a client signal and a publisher domain are present", () => {
  const r = attributeMeeting(
    {
      title: "Penfold's catch up WIP",
      attendeeEmails: [
        "a@assembledmedia.com.au",
        "ops@nine.com.au",
      ],
    },
    {
      knownMbas: new Map(),
      domainToClient: new Map(),
      domainToPublisher: new Map([["nine.com.au", 11]]),
      titleRules: new Map(),
      assembledDomains: ASSEMBLED,
      titleClients: [
        {
          clientId: 101,
          displayName: "Penfolds",
          phrases: ["penfolds", "penfold"],
        },
      ],
    }
  )
  assert.equal(r.kind, "client")
  if (r.kind === "client") {
    assert.equal(r.clientId, 101)
    assert.equal(r.matchedBy, "title")
  }
})
