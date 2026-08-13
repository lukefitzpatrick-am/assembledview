import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { aliasesForClient, buildTitleClientIndex } from "../titleClients.js"

describe("aliasesForClient", () => {
  it("seeds Penfold's alongside the display name", () => {
    const aliases = aliasesForClient("Penfolds", "PENFOLD", [])
    assert.ok(aliases.some((a) => a.toLowerCase().includes("penfold")))
  })
})

describe("buildTitleClientIndex", () => {
  it("collapses group members onto the anchor client", () => {
    const index = buildTitleClientIndex([
      {
        clientId: 201,
        displayName: "BOSS Engineering",
        mbaidentifier: "BOSS",
        aliases: ["BOSS", "Boss Engineering"],
        isAnchor: true,
      },
      {
        clientId: 202,
        displayName: "Boss Automotive",
        mbaidentifier: "BOSS",
        aliases: ["Boss Automotive"],
        isAnchor: false,
      },
    ])
    assert.equal(index.length, 1)
    assert.equal(index[0]!.clientId, 201)
    assert.equal(index[0]!.displayName, "BOSS Engineering")
    assert.ok(index[0]!.phrases.includes("boss automotive"))
  })
})
