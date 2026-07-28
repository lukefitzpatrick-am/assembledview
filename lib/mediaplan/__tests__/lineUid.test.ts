import { describe, expect, it } from "vitest"
import {
  backfillLineUid,
  ensureLineUids,
  mintLineUid,
  pickLineUid,
} from "@/lib/mediaplan/lineUid"

describe("lineUid", () => {
  it("mintLineUid returns a UUID string", () => {
    const uid = mintLineUid()
    expect(uid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it("ensureLineUids never remints an existing uid", () => {
    const existing = "11111111-2222-4333-8444-555555555555"
    const items = [
      { line_uid: existing, name: "a" },
      { lineUid: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", name: "b" },
      { name: "c" },
      { line_uid: "   ", name: "d" },
    ]
    const out = ensureLineUids(items)
    expect(out[0].line_uid).toBe(existing)
    expect(out[1].line_uid).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
    expect(out[2].line_uid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(out[3].line_uid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    // Second pass must be identical — never remint.
    const again = ensureLineUids(out)
    expect(again.map((r) => r.line_uid)).toEqual(out.map((r) => r.line_uid))
  })

  it("ensureLineUids does not derive uid from array index", () => {
    const a = ensureLineUids([{ name: "x" }, { name: "y" }])
    const b = ensureLineUids([{ name: "y" }, { name: "x" }])
    expect(a[0].line_uid).not.toBe(b[1].line_uid)
    expect(a[0].line_uid).not.toBe("0")
    expect(a[1].line_uid).not.toBe("1")
  })

  it("pickLineUid reads snake or camel and treats blank as absent", () => {
    expect(pickLineUid({ line_uid: "abc" })).toBe("abc")
    expect(pickLineUid({ lineUid: "def" })).toBe("def")
    expect(pickLineUid({ line_uid: "  " })).toBeUndefined()
    expect(pickLineUid({})).toBeUndefined()
  })

  it("backfillLineUid is deterministic for the same inputs", () => {
    const args = {
      mba_number: "PENFOLD016",
      media_plan_version: 42,
      line_item_id: "PENFOLD016TV1",
      table: "media_plan_television",
    }
    const first = backfillLineUid(args)
    const second = backfillLineUid(args)
    expect(first).toBe(second)
    expect(first.length).toBeGreaterThan(16)
  })

  it("backfillLineUid changes when any key part changes", () => {
    const base = {
      mba_number: "MBA1",
      media_plan_version: 1,
      line_item_id: "MBA1TV1",
      table: "media_plan_television",
    }
    expect(backfillLineUid({ ...base, mba_number: "MBA2" })).not.toBe(
      backfillLineUid(base)
    )
    expect(backfillLineUid({ ...base, media_plan_version: 2 })).not.toBe(
      backfillLineUid(base)
    )
    expect(backfillLineUid({ ...base, line_item_id: "MBA1TV2" })).not.toBe(
      backfillLineUid(base)
    )
    expect(
      backfillLineUid({ ...base, table: "media_plan_radio" })
    ).not.toBe(backfillLineUid(base))
  })
})
