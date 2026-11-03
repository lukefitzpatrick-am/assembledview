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
