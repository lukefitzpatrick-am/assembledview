import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EXCLUDED_PUBLISHER_IDS,
  buildAssignTargetOptions,
} from "../assignTargets.js"

describe("buildAssignTargetOptions", () => {
  it("excludes publishers id 61 (trailing-space Nine duplicate)", () => {
    const options = buildAssignTargetOptions({
      clients: [
        { id: 2, mpClientName: "Zebra Co", mbaidentifier: "ZEB" },
        { id: 1, mpClientName: "Acme", mbaidentifier: "ACME001" },
      ],
      publishers: [
        { id: 11, publisherName: "Nine" },
        { id: 61, publisherName: "Nine " },
        { id: 4, publisherName: "Meta" },
      ],
    })

    assert.ok(EXCLUDED_PUBLISHER_IDS.has(61))
    assert.equal(
      options.some((o) => o.value === "publisher:61"),
      false
    )
    assert.ok(options.some((o) => o.value === "publisher:11"))

    const clientLabels = options
      .filter((o) => o.group === "Clients")
      .map((o) => o.label)
    assert.deepEqual(clientLabels, ["Acme — ACME001", "Zebra Co — ZEB"])

    const publisherLabels = options
      .filter((o) => o.group === "Publishers")
      .map((o) => o.label)
    assert.deepEqual(publisherLabels, ["Meta", "Nine"])

    assert.ok(options.some((o) => o.value === "internal" && o.label === "Internal"))
    assert.ok(
      options.some(
        (o) => o.value === "new_business" && o.label === "New Business"
      )
    )
  })
})
