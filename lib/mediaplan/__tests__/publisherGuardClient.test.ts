/**
 * B19 Q4: the editors' pre-flight runs the server's gate with the switch the
 * root layout sends. Default off: nothing changes.
 */
import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import { setClientFeatureSnapshot } from "@/lib/features/client"
import {
  publisherGuardBlockedToast,
  publisherGuardPreflight,
  publisherWarningsToast,
} from "@/lib/mediaplan/publisherGuardClient"

const PUBLISHERS = [{ id: 11, publisher_name: "Nine", publisherid: "nine" }]
const LINES = [
  { lineItemId: "DD1", channel: "digi_display", publisher: "Nine Digital" },
  { lineItemId: "S1", channel: "search", platform: "" },
]

afterEach(() => setClientFeatureSnapshot(null))

describe("publisherGuardPreflight", () => {
  it("switch off by default: no reject", () => {
    setClientFeatureSnapshot(null)
    assert.deepEqual(publisherGuardPreflight("publish", LINES, PUBLISHERS), { reject: false, warnings: [] })
  })

  it("switch on from the layout snapshot: rejects the unknown name", () => {
    setClientFeatureSnapshot({ publisher_guard: true })
    const r = publisherGuardPreflight("publish", LINES, PUBLISHERS)
    assert.equal(r.reject, true)
    if (r.reject) assert.deepEqual(r.body.lineItemIds, ["DD1"])
  })

  it("no save mode, draft or an empty publisher list: no reject", () => {
    assert.equal(publisherGuardPreflight(null, LINES, PUBLISHERS, true).reject, false)
    assert.equal(publisherGuardPreflight("draft", LINES, PUBLISHERS, true).reject, false)
    assert.equal(publisherGuardPreflight("publish", LINES, [], true).reject, false)
  })
})

describe("toasts", () => {
  it("blocked toast names the lines", () => {
    const r = publisherGuardPreflight("publish", LINES, PUBLISHERS, true)
    assert.equal(r.reject, true)
    if (!r.reject) return
    const t = publisherGuardBlockedToast(r.body.publisherIssues)
    assert.equal(t.title, "Publisher not in Publishers")
    assert.match(t.description, /"Nine Digital" \(DD1\)/)
  })

  it("warnings toast: none, one, several", () => {
    assert.equal(publisherWarningsToast([]), null)
    const r = publisherGuardPreflight("publish", [LINES[1]], PUBLISHERS, true)
    assert.equal(r.reject, false)
    if (r.reject) return
    assert.equal(publisherWarningsToast(r.warnings)?.title, "1 line has no publisher")
    assert.equal(publisherWarningsToast([...r.warnings, ...r.warnings])?.title, "2 lines have no publisher")
  })
})

describe("pre-flight and server agree on empty lines (B19 review finding 1)", () => {
  const PROD_PUBLISHERS = [{ id: 1, publisher_name: "Nine", publisherid: "nine" }]
  // PENFOLD018PROD1 shape: a $0 production line with no publisher, beside a real line.
  const lines = [
    { lineItemId: "KRUSTY001PROD1", channel: "production", publisher: "", bursts: [{ budget: "0", buyAmount: "", calculatedValue: 0 }] },
    { lineItemId: "KRUSTY001DD1", channel: "digi_display", publisher: "Nine", buyType: "cpm", bursts: [{ budget: "1000", buyAmount: "10", calculatedValue: 100000 }] },
  ]

  it("a $0 production line with no publisher passes the pre-flight, as it passes the server", async () => {
    const { publisherGuardGateResult } = await import("@/lib/mediaplan/publisherGuard")
    const { stripEmptyLinesOnPublish } = await import("@/lib/mediaplan/stripEmptyLineItems")
    const client = publisherGuardPreflight("publish", lines, PROD_PUBLISHERS, true)
    // What the save route does: strip on publish, then the guard.
    const server = publisherGuardGateResult({
      mode: "publish",
      enabled: true,
      lineItems: stripEmptyLinesOnPublish("publish", [...lines]).lineItems,
      publishers: PROD_PUBLISHERS,
    })
    assert.equal(client.reject, false)
    assert.deepEqual(client, server)
  })

  it("the same production line with money is still blocked by both", async () => {
    const { publisherGuardGateResult } = await import("@/lib/mediaplan/publisherGuard")
    const funded = [{ ...lines[0]!, bursts: [{ budget: "500", buyAmount: "500", calculatedValue: 1 }] }, lines[1]!]
    const client = publisherGuardPreflight("publish", funded, PROD_PUBLISHERS, true)
    const server = publisherGuardGateResult({ mode: "publish", enabled: true, lineItems: funded, publishers: PROD_PUBLISHERS })
    assert.equal(client.reject, true)
    assert.deepEqual(client, server)
  })
})
