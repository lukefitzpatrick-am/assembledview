import assert from "node:assert/strict"
import test from "node:test"

import {
  formatTimesheetDuration,
  timesheetDraftStatusMeta,
} from "../timesheetDraftUi.js"

test("formats draft duration as compact hours and minutes", () => {
  assert.equal(formatTimesheetDuration(30), "30m")
  assert.equal(formatTimesheetDuration(60), "1h")
  assert.equal(formatTimesheetDuration(95), "1h 35m")
})

test("blocked draft statuses expose their reason and mapping action", () => {
  assert.deepEqual(timesheetDraftStatusMeta("blocked_overlap"), {
    label: "Blocked: overlap",
    variant: "warning",
    blocked: true,
    showMappingLink: false,
  })
  assert.deepEqual(timesheetDraftStatusMeta("blocked_structure"), {
    label: "Blocked: mapping",
    variant: "blocking",
    blocked: true,
    showMappingLink: true,
  })
})

test("proposed drafts are actionable while terminal statuses are not blocked", () => {
  assert.equal(timesheetDraftStatusMeta("proposed").label, "Proposed")
  assert.equal(timesheetDraftStatusMeta("confirmed").blocked, false)
  assert.equal(timesheetDraftStatusMeta("skipped").blocked, false)
})
