import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  attributeMeeting,
  extractEmailDomain,
  isAssembledDomain,
} from "../attribution.js"

const ASSEMBLED = new Set([
  "assembledmedia.com.au",
  "assembled.media",
  "assembledview.com.au",
])

describe("extractEmailDomain / isAssembledDomain", () => {
  it("lowercases domain from email", () => {
    assert.equal(extractEmailDomain("Luke@Acme.COM"), "acme.com")
  })

  it("recognises assembled domains", () => {
    assert.equal(isAssembledDomain("assembledmedia.com.au", ASSEMBLED), true)
    assert.equal(isAssembledDomain("client.com", ASSEMBLED), false)
  })
})

describe("attributeMeeting — title convention", () => {
  const known = new Map([
    ["foo001", { mbaNumber: "FOO001", clientId: 10 }],
    ["bar002", { mbaNumber: "BAR002", clientId: 20 }],
  ])

  it("matches [MBA] bracket convention case-insensitively", () => {
    const r = attributeMeeting(
      {
        title: "[foo001] Weekly pacing",
        attendeeEmails: ["a@assembledmedia.com.au"],
      },
      { knownMbas: known, domainToClient: new Map(), assembledDomains: ASSEMBLED }
    )
    assert.equal(r.kind, "campaign")
    if (r.kind === "campaign") {
      assert.equal(r.mbaNumber, "FOO001")
      assert.equal(r.clientId, 10)
      assert.equal(r.matchedBy, "title")
    }
  })

  it("matches bare mba_number token (anchored, not substring)", () => {
    const r = attributeMeeting(
      {
        title: "Sync FOO001 tomorrow",
        attendeeEmails: ["a@assembledmedia.com.au"],
      },
      { knownMbas: known, domainToClient: new Map(), assembledDomains: ASSEMBLED }
    )
    assert.equal(r.kind, "campaign")
    if (r.kind === "campaign") {
      assert.equal(r.mbaNumber, "FOO001")
      assert.equal(r.matchedBy, "title")
    }
  })

  it("does not match MBA as substring of a longer token", () => {
    const r = attributeMeeting(
      {
        title: "FOO00199 planning",
        attendeeEmails: ["a@assembledmedia.com.au", "x@client.com"],
      },
      {
        knownMbas: known,
        domainToClient: new Map([["client.com", 99]]),
        assembledDomains: ASSEMBLED,
      }
    )
    // falls through to domain
    assert.equal(r.kind, "client")
    if (r.kind === "client") {
      assert.equal(r.clientId, 99)
      assert.equal(r.matchedBy, "domain")
    }
  })
})

describe("attributeMeeting — domain", () => {
  it("maps attendee domain via client_domains", () => {
    const r = attributeMeeting(
      {
        title: "Intro call",
        attendeeEmails: [
          "luke@assembledmedia.com.au",
          "jane@acme.com.au",
        ],
      },
      {
        knownMbas: new Map(),
        domainToClient: new Map([["acme.com.au", 42]]),
        assembledDomains: ASSEMBLED,
      }
    )
    assert.equal(r.kind, "client")
    if (r.kind === "client") {
      assert.equal(r.clientId, 42)
      assert.equal(r.matchedBy, "domain")
    }
  })

  it("flags internal when all attendee domains are assembled", () => {
    const r = attributeMeeting(
      {
        title: "Standup",
        attendeeEmails: [
          "a@assembledmedia.com.au",
          "b@assembled.media",
        ],
      },
      {
        knownMbas: new Map(),
        domainToClient: new Map(),
        assembledDomains: ASSEMBLED,
      }
    )
    assert.equal(r.kind, "internal")
    if (r.kind === "internal") {
      assert.equal(r.clientId, null)
      assert.equal(r.isInternal, true)
    }
  })

  it("unattributed when no title MBA and no domain match", () => {
    const r = attributeMeeting(
      {
        title: "Mystery meeting",
        attendeeEmails: ["x@unknown.co"],
      },
      {
        knownMbas: new Map(),
        domainToClient: new Map(),
        assembledDomains: ASSEMBLED,
      }
    )
    assert.equal(r.kind, "unattributed")
  })
})
