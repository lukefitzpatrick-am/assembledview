/**
 * M1 (B36fix, C-195): structural guard. Taint rides only on what the client
 * sends back while the server keeps no taint record of its own, so no
 * registry tool may read captured text until that record exists (and
 * APP_SIGNING_SECRET is confirmed in production). This test fails the moment
 * a tool is tagged `capture` while AVA_SERVER_TAINT_RECORD is false.
 */
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

import { AVA_SERVER_TAINT_RECORD } from "../taintRules.js"
import { AVA_TOOL_TAGS, avaToolTag } from "../tools/toolAccess.js"
import { AVA_TOOL_NAMES } from "../tools/summaries.js"

const SERVER_RECORD_MODULE = path.resolve(process.cwd(), "lib/ava/taintRecord.ts")

function captureTagged(): string[] {
  const names = new Set<string>([...Object.keys(AVA_TOOL_TAGS), ...AVA_TOOL_NAMES])
  return [...names].filter((name) => avaToolTag(name)?.capture === true).sort()
}

describe("capture tools wait for a server-side taint record (C-195)", () => {
  it("no tool carries a capture tag while the server keeps no taint record", () => {
    if (AVA_SERVER_TAINT_RECORD) return
    assert.deepEqual(
      captureTagged(),
      [],
      "A capture tool needs a server-side taint record per conversation and owner, and APP_SIGNING_SECRET confirmed in production, first (KNOWN-ISSUES C-195).",
    )
  })

  it("every registered tool name has a tag, so none can dodge the guard", () => {
    for (const name of AVA_TOOL_NAMES) {
      assert.ok(avaToolTag(name), `${name} has no tag`)
    }
  })

  it("the server record flag is only true with a server record module", () => {
    if (!AVA_SERVER_TAINT_RECORD) {
      assert.equal(existsSync(SERVER_RECORD_MODULE), false, "taintRecord.ts exists: wire it and flip AVA_SERVER_TAINT_RECORD")
      return
    }
    assert.equal(existsSync(SERVER_RECORD_MODULE), true, "AVA_SERVER_TAINT_RECORD is true but lib/ava/taintRecord.ts does not exist")
  })
})
