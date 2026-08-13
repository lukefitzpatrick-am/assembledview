import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  attributeMeeting,
  extractEmailDomain,
  isAssembledDomain,
} from "../attribution.js"
import type { AttributionContext } from "../types.js"

const ASSEMBLED = new Set([
  "assembledmedia.com.au",
  "assembled.media",
  "assembledview.com.au",
])

function ctx(over: Partial<AttributionContext> = {}): AttributionContext {
  return {
    knownMbas: new Map(),
    domainToClient: new Map(),
    assembledDomains: ASSEMBLED,
    titleClients: [],
    ...over,
  }
}

describe("extractEmailDomain / isAssembledDomain", () => {
  it("lowercases domain from email", () => {
    assert.equal(extractEmailDomain("Luke@Acme.COM"), "acme.com")
  })

  it("recognises assembled domains", () => {
    assert.equal(isAssembledDomain("assembledmedia.com.au", ASSEMBLED), true)
    assert.equal(isAssembledDomain("client.com", ASSEMBLED), false)
  })
})

describe("attributeMeeting — client title first", () => {
  const titleClients = [
    {
      clientId: 10,
      displayName: "Acme",
      phrases: ["acme"],
    },
  ]

  it("matches a unique client name in the title", () => {
    const r = attributeMeeting(
      {
        title: "Acme weekly pacing",
        attendeeEmails: ["a@assembledmedia.com.au"],
      },
      ctx({ titleClients })
    )
    assert.equal(r.kind, "client")
    if (r.kind === "client") {
      assert.equal(r.clientId, 10)
      assert.equal(r.matchedBy, "title")
      assert.equal(r.mbaNumber, null)
    }
  })

  it("refines mba_number only when the token belongs to that client", () => {
    const r = attributeMeeting(
      {
        title: "Acme [foo001] weekly",
        attendeeEmails: ["a@assembledmedia.com.au"],
      },
      ctx({
        titleClients,
        knownMbas: new Map([
          ["foo001", { mbaNumber: "FOO001", clientId: 10 }],
        ]),
      })
    )
    assert.equal(r.kind, "client")
    if (r.kind === "client") {
      assert.equal(r.mbaNumber, "FOO001")
    }
  })

  it("does not attribute from an MBA token alone", () => {
    const r = attributeMeeting(
      {
        title: "[FOO001] Weekly pacing",
        attendeeEmails: ["a@assembledmedia.com.au", "x@unknown.co"],
      },
      ctx({
        knownMbas: new Map([
          ["foo001", { mbaNumber: "FOO001", clientId: 10 }],
        ]),
      })
    )
    assert.equal(r.kind, "unattributed")
  })

  it("queues when two client names match the title", () => {
    const r = attributeMeeting(
      {
        title: "Acme and Beta catch-up",
        attendeeEmails: ["a@assembledmedia.com.au"],
      },
      ctx({
        titleClients: [
          { clientId: 10, displayName: "Acme", phrases: ["acme"] },
          { clientId: 20, displayName: "Beta", phrases: ["beta"] },
        ],
      })
    )
    assert.equal(r.kind, "unattributed")
    if (r.kind === "unattributed") {
      assert.equal(r.candidates.length, 2)
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
      ctx({ domainToClient: new Map([["acme.com.au", 42]]) })
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
      ctx()
    )
    assert.equal(r.kind, "internal")
    if (r.kind === "internal") {
      assert.equal(r.clientId, null)
      assert.equal(r.isInternal, true)
    }
  })

  it("unattributed when no title client and no domain match", () => {
    const r = attributeMeeting(
      {
        title: "Mystery meeting",
        attendeeEmails: ["x@unknown.co"],
      },
      ctx()
    )
    assert.equal(r.kind, "unattributed")
    if (r.kind === "unattributed") {
      assert.deepEqual(r.candidates, [])
    }
  })
})

describe("attributeMeeting — publisher domain after client domain", () => {
  it("attributes publisher when the only external domain is a publisher domain", () => {
    const r = attributeMeeting(
      {
        title: "Inventory review",
        attendeeEmails: [
          "luke@assembledmedia.com.au",
          "ops@nine.com.au",
        ],
      },
      ctx({ domainToPublisher: new Map([["nine.com.au", 11]]) })
    )
    assert.equal(r.kind, "publisher")
    if (r.kind === "publisher") {
      assert.equal(r.publisherId, 11)
      assert.equal(r.matchedBy, "publisher_domain")
      assert.equal(r.clientId, null)
    }
  })

  it("CLIENT BEATS PUBLISHER when a client domain and a publisher domain both match", () => {
    const r = attributeMeeting(
      {
        title: "Intro call",
        attendeeEmails: ["jane@acme.com", "ops@nine.com.au"],
      },
      ctx({
        domainToClient: new Map([["acme.com", 42]]),
        domainToPublisher: new Map([["nine.com.au", 11]]),
      })
    )
    assert.equal(r.kind, "client")
    if (r.kind === "client") {
      assert.equal(r.clientId, 42)
      assert.equal(r.matchedBy, "domain")
    }
  })
})

describe("attributeMeeting — meeting_title_rules after publisher domain", () => {
  it("attributes internal from a stored title rule", () => {
    const r = attributeMeeting(
      {
        title: "Assembled weekly standup",
        attendeeEmails: ["a@assembledmedia.com.au", "x@otheragency.com"],
      },
      ctx({
        titleRules: new Map([["assembled weekly standup", "internal"]]),
      })
    )
    assert.equal(r.kind, "internal")
    if (r.kind === "internal") {
      assert.equal(r.matchedBy, "title_rule")
      assert.equal(r.isInternal, true)
    }
  })

  it("attributes new_business from a stored title rule", () => {
    const r = attributeMeeting(
      {
        title: "Prospect intro — Riviera",
        attendeeEmails: ["a@assembledmedia.com.au", "ceo@riviera.example"],
      },
      ctx({
        titleRules: new Map([["prospect intro riviera", "new_business"]]),
      })
    )
    assert.equal(r.kind, "new_business")
    if (r.kind === "new_business") {
      assert.equal(r.matchedBy, "title_rule")
      assert.equal(r.isInternal, false)
    }
  })
})
