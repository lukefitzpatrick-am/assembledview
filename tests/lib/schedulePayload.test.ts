import assert from "node:assert/strict"
import test from "node:test"
import {
  hasPersistableSchedulePayload,
  resolveSchedulePayloadForVersionSave,
} from "../../lib/mediaplan/schedulePayload.js"

test("hasPersistableSchedulePayload rejects empty schedule containers", () => {
  assert.equal(hasPersistableSchedulePayload(null), false)
  assert.equal(hasPersistableSchedulePayload({}), false)
  assert.equal(hasPersistableSchedulePayload([]), false)
  assert.equal(hasPersistableSchedulePayload({ months: [] }), false)
  assert.equal(hasPersistableSchedulePayload(JSON.stringify({ months: [] })), false)
})

test("resolveSchedulePayloadForVersionSave preserves latest persisted schedule when incoming is empty", () => {
  const persisted = [{ monthYear: "May 2026", mediaTypes: [] }]

  assert.equal(resolveSchedulePayloadForVersionSave({}, persisted), persisted)
  assert.equal(resolveSchedulePayloadForVersionSave([], persisted), persisted)
  assert.deepEqual(resolveSchedulePayloadForVersionSave([{ monthYear: "June 2026" }], persisted), [
    { monthYear: "June 2026" },
  ])
})
