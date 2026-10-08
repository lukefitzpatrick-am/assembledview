/**
 * 23505 disambiguation: version UNIQUE ≠ line_item_id UNIQUE.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { classifySaveUniqueViolation } from "../classifySaveUniqueViolation"

describe("classifySaveUniqueViolation", () => {
  it("line_items_version_id_line_item_id_key → DUPLICATE_LINE_ITEM_ID", () => {
    const r = classifySaveUniqueViolation({
      code: "23505",
      constraint: "line_items_version_id_line_item_id_key",
      message:
        'duplicate key value violates unique constraint "line_items_version_id_line_item_id_key"',
    })
    assert.equal(r.code, "DUPLICATE_LINE_ITEM_ID")
    assert.equal(r.constraint, "line_items_version_id_line_item_id_key")
  })

  it("media_plan_versions master/version unique → VERSION_ALREADY_EXISTS", () => {
    const r = classifySaveUniqueViolation({
      code: "23505",
      constraint: "media_plan_versions_master_id_version_number_key",
      message:
        'duplicate key value violates unique constraint "media_plan_versions_master_id_version_number_key"',
    })
    assert.equal(r.code, "VERSION_ALREADY_EXISTS")
    assert.equal(r.constraint, "media_plan_versions_master_id_version_number_key")
  })

  it("reads constraint from cause (node-postgres / drizzle wrap)", () => {
    const r = classifySaveUniqueViolation({
      message: "Failed query",
      cause: {
        code: "23505",
        constraint: "media_plan_versions_master_id_version_number_key",
        message: 'duplicate key value violates unique constraint "media_plan_versions_master_id_version_number_key"',
      },
    })
    assert.equal(r.code, "VERSION_ALREADY_EXISTS")
  })

  it("new master mba_number unique → MBA_NUMBER_TAKEN", () => {
    const r = classifySaveUniqueViolation(
      {
        code: "23505",
        constraint: "media_plan_masters_mba_number_unique",
        message:
          'duplicate key value violates unique constraint "media_plan_masters_mba_number_unique"',
      },
      { creatingNewMaster: true },
    )
    assert.equal(r.code, "MBA_NUMBER_TAKEN")
    assert.equal(r.constraint, "media_plan_masters_mba_number_unique")
  })

  it("existing master mba_number unique stays UNIQUE_VIOLATION", () => {
    const err = {
      code: "23505",
      cause: {
        constraint: "media_plan_masters_mba_number_unique",
        message:
          'duplicate key value violates unique constraint "media_plan_masters_mba_number_unique"',
      },
    }
    assert.equal(classifySaveUniqueViolation(err).code, "UNIQUE_VIOLATION")
    assert.equal(
      classifySaveUniqueViolation(err, { creatingNewMaster: false }).code,
      "UNIQUE_VIOLATION",
    )
  })

  it("unknown unique → UNIQUE_VIOLATION", () => {
    const r = classifySaveUniqueViolation({
      code: "23505",
      constraint: "some_other_unique_key",
      message: 'duplicate key value violates unique constraint "some_other_unique_key"',
    })
    assert.equal(r.code, "UNIQUE_VIOLATION")
  })
})
