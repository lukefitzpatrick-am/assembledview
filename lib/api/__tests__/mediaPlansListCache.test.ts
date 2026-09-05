import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  MEDIA_PLANS_LIST_MASTER_OWNED_STRING_FIELDS,
  overlayMasterOwnedListFields,
} from "../overlayMasterOwnedListFields"

/** Fields the list UI + search require as present strings after merge. */
const REQUIRED_LIST_STRING_FIELDS = [
  "mp_client_name",
  "mba_number",
] as const

describe("mediaPlansListCache list-shape parity", () => {
  it("pins master-owned overlay fields (Xano _latest carried these inline)", () => {
    assert.deepEqual([...MEDIA_PLANS_LIST_MASTER_OWNED_STRING_FIELDS], [
      "mp_client_name",
    ])
  })

  it("overlays mp_client_name from master onto a postgres-shaped version row", () => {
    const pgVersion = {
      id: 42,
      mba_number: "jayco001",
      version_number: 7,
      campaign_name: "Jayco AU - Annual Plan",
      brand: "Jayco AU",
      campaign_status: "booked",
      campaign_start_date: "2026-01-01",
      campaign_end_date: "2026-12-31",
      mp_campaignbudget: 253226,
      // intentionally absent: mp_client_name (Postgres versions do not store it)
    }
    const master = {
      mba_number: "jayco001",
      mp_client_name: "Jayco",
      version_number: 7,
      mp_campaignname: "Jayco AU - Annual Plan",
    }

    const row = overlayMasterOwnedListFields(pgVersion, master)

    for (const field of REQUIRED_LIST_STRING_FIELDS) {
      assert.equal(typeof row[field], "string", `${field} must be string-typed`)
      assert.ok(
        (row[field] as string).length > 0 || field === "mba_number",
        `${field} should be present`,
      )
    }
    assert.equal(row.mp_client_name, "Jayco")
    assert.equal(row.mba_number, "jayco001")
    assert.equal(row.campaign_name, "Jayco AU - Annual Plan")
    assert.equal(row.brand, "Jayco AU")
    assert.equal(row.version_number, 7)
  })

  it("keeps Xano inline mp_client_name when already on the version row", () => {
    const xanoLatest = {
      id: 1,
      mba_number: "bicau001",
      mp_client_name: "BIC",
      version_number: 3,
    }
    const master = {
      mba_number: "bicau001",
      mp_client_name: "BIC Corp",
      version_number: 3,
    }
    const row = overlayMasterOwnedListFields(xanoLatest, master)
    assert.equal(row.mp_client_name, "BIC")
  })

  it("string-types mp_client_name even with no master", () => {
    const row = overlayMasterOwnedListFields(
      { id: 1, mba_number: "orphan001" },
      undefined,
    )
    assert.equal(typeof row.mp_client_name, "string")
    assert.equal(row.mp_client_name, "")
  })

  it("overlays published_version_id from master when the field is present", () => {
    const row = overlayMasterOwnedListFields(
      { id: 42, mba_number: "jayco001", version_number: 7 },
      { mba_number: "jayco001", mp_client_name: "Jayco", published_version_id: 99 },
    )
    assert.equal(row.published_version_id, 99)
    assert.equal(row.id, 42)
  })

  it("does not invent published_version_id when the master lacks the field", () => {
    const row = overlayMasterOwnedListFields(
      { id: 1, mba_number: "jayco001" },
      { mba_number: "jayco001", mp_client_name: "Jayco" },
    )
    assert.equal("published_version_id" in row, false)
  })
})
