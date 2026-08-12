import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildProposalDescription,
  isPossibleDuplicate,
  parseActionItems,
} from "../actionItems.js"

describe("parseActionItems", () => {
  const roster = [
    { email: "luke@assembledmedia.com.au", name: "Luke Fitzpatrick" },
    { email: "sam@assembledmedia.com.au", name: "Sam Chen" },
  ]

  it("splits bullets and matches named assignee on roster", () => {
    const items = parseActionItems(
      "- Luke Fitzpatrick: Send pacing deck\n- Follow up with client",
      roster,
      ["luke@assembledmedia.com.au", "client@acme.com"]
    )
    assert.equal(items.length, 2)
    assert.equal(items[0]!.title, "Send pacing deck")
    assert.equal(items[0]!.assigneeEmail, "luke@assembledmedia.com.au")
    assert.equal(items[0]!.sourceLine.includes("Luke"), true)
    assert.equal(items[1]!.assigneeEmail, null)
  })

  it("matches email mentioned in the line", () => {
    const items = parseActionItems(
      "- sam@assembledmedia.com.au to revise creative",
      roster,
      []
    )
    assert.equal(items[0]!.assigneeEmail, "sam@assembledmedia.com.au")
  })
})

describe("isPossibleDuplicate", () => {
  it("flags same title + MBA case-insensitively among open tasks", () => {
    assert.equal(
      isPossibleDuplicate("Send deck", "FOO001", [
        { title: "send DECK", mbaNumber: "foo001" },
      ]),
      true
    )
  })

  it("does not flag different MBA or missing MBA", () => {
    assert.equal(
      isPossibleDuplicate("Send deck", "FOO001", [
        { title: "Send deck", mbaNumber: "BAR002" },
      ]),
      false
    )
    assert.equal(
      isPossibleDuplicate("Send deck", null, [
        { title: "Send deck", mbaNumber: "FOO001" },
      ]),
      false
    )
  })
})

describe("buildProposalDescription", () => {
  it("quotes source line and includes meeting URL", () => {
    const d = buildProposalDescription({
      sourceLine: "Send pacing deck",
      meetingTitle: "[FOO001] Sync",
      meetingUrl: "https://app.fireflies.ai/view/x",
      meetingDate: "2026-08-10T10:00:00.000Z",
    })
    assert.match(d, /Send pacing deck/)
    assert.match(d, /fireflies/)
    assert.match(d, /FOO001/)
  })
})
