import assert from "node:assert/strict"
import { test } from "node:test"

import { applyManualAssignment } from "../assign.js"

test("assignment persists client_domains and re-attributes unattributed notes", async () => {
  const domains = new Map<string, number>()
  const notes = new Map<
    number,
    {
      id: number
      clientId: number | null
      matchedBy: string | null
      participants: string
      isInternal: boolean
    }
  >([
    [
      1,
      {
        id: 1,
        clientId: null,
        matchedBy: null,
        participants: JSON.stringify([
          "luke@assembledmedia.com.au",
          "jane@acme.com",
        ]),
        isInternal: false,
      },
    ],
    [
      2,
      {
        id: 2,
        clientId: null,
        matchedBy: null,
        participants: JSON.stringify(["other@acme.com"]),
        isInternal: false,
      },
    ],
  ])

  const result = await applyManualAssignment(
    { noteId: 1, clientId: 77 },
    {
      getNote: async (id) => notes.get(id) ?? null,
      updateNoteClient: async (id, clientId, matchedBy) => {
        const n = notes.get(id)!
        n.clientId = clientId
        n.matchedBy = matchedBy
      },
      upsertClientDomain: async (clientId, domain) => {
        domains.set(domain, clientId)
      },
      listUnattributed: async () =>
        [...notes.values()].filter((n) => n.clientId == null && !n.isInternal),
      assembledDomains: new Set(["assembledmedia.com.au"]),
    }
  )

  assert.equal(result.ok, true)
  assert.equal(notes.get(1)!.clientId, 77)
  assert.equal(notes.get(1)!.matchedBy, "manual")
  assert.equal(domains.get("acme.com"), 77)
  assert.equal(notes.get(2)!.clientId, 77)
  assert.equal(notes.get(2)!.matchedBy, "domain")
})
