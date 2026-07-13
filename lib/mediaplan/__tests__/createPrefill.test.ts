import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildCreateCampaignHref,
  parsePrefillYmd,
} from "../createPrefill"

describe("createPrefill", () => {
  it("builds href with trimmed campaign name and ids", () => {
    assert.equal(
      buildCreateCampaignHref({
        clientId: 42,
        campaignName: "  Spring launch  ",
        start: "2026-07-01",
        end: "2026-09-30",
      }),
      "/mediaplans/create?clientId=42&campaignName=Spring+launch&start=2026-07-01&end=2026-09-30"
    )
  })

  it("omits empty fields", () => {
    assert.equal(buildCreateCampaignHref({}), "/mediaplans/create")
    assert.equal(
      buildCreateCampaignHref({ campaignName: "   " }),
      "/mediaplans/create"
    )
  })

  it("parses valid YMD and rejects malformed", () => {
    const d = parsePrefillYmd("2026-07-11")
    assert.ok(d)
    assert.equal(d!.getFullYear(), 2026)
    assert.equal(d!.getMonth(), 6)
    assert.equal(d!.getDate(), 11)
    assert.equal(parsePrefillYmd("2026-13-01"), null)
    assert.equal(parsePrefillYmd("07/11/2026"), null)
    assert.equal(parsePrefillYmd(""), null)
    assert.equal(parsePrefillYmd(null), null)
  })
})
