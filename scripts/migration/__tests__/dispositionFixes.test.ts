/**
 * Golden tests for Phase-1 gate-review disposition ETL fixes (T1).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildLineItems,
  resolveRemappedVersionId,
  type VersionRef,
} from "../_lineItemTransform"
import { explodeScheduleToMonthRows } from "../_scheduleTransform"

describe("resolveRemappedVersionId (transitive chains)", () => {
  it("follows PENFOLD017-style chains to the final kept id", () => {
    const remap = new Map([
      [773, 774],
      [774, 775],
      [775, 776],
      [776, 777],
    ])
    assert.equal(resolveRemappedVersionId(773, remap), 777)
    assert.equal(resolveRemappedVersionId(774, remap), 777)
    assert.equal(resolveRemappedVersionId(777, remap), 777)
  })

  it("is a no-op when id is already kept", () => {
    const remap = new Map([[456, 457], [457, 458]])
    assert.equal(resolveRemappedVersionId(458, remap), 458)
  })
})

describe("media_plan_version=0 → mba+mp_plannumber fallback", () => {
  it("rescues version=0 rows via mp_plannumber", () => {
    const versionsById = new Map<number, VersionRef>([
      [100, { id: 100, mbaNumber: "PENFOLD001", versionNumber: 6 }],
    ])
    const versionsByMba = new Map<string, VersionRef[]>([
      ["penfold001", [{ id: 100, mbaNumber: "PENFOLD001", versionNumber: 6 }]],
    ])
    const { inserts, skips } = buildLineItems({
      channelRows: [
        {
          channel: "search",
          rows: [
            {
              id: 1,
              mba_number: "PENFOLD001",
              mp_plannumber: 6,
              media_plan_version: 0,
              line_item_id: "PENFOLD001SE1",
              line_item: 1,
            },
          ],
        },
      ],
      versionsById,
      versionsByMba,
    })
    assert.equal(skips.length, 0)
    assert.equal(inserts.length, 1)
    assert.equal(inserts[0].versionId, 100)
  })
})

describe("empty {} delivery blob is no-delivery, not a parse failure", () => {
  it("treats {} as empty (curatif002 / malay001 shape)", () => {
    const result = explodeScheduleToMonthRows(60, "delivery", {})
    assert.equal(result.failureReason, null)
    assert.equal(result.rows.length, 0)
  })

  it("treats { months: [] } as empty", () => {
    const result = explodeScheduleToMonthRows(60, "delivery", { months: [] })
    assert.equal(result.failureReason, null)
    assert.equal(result.rows.length, 0)
  })
})
