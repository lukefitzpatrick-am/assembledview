import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyMasterOwnedOverlayByMba,
  overlayMasterOwnedListFields,
} from "../overlayMasterOwnedListFields"

/**
 * DI-9b — dashboard `/api/media_plans` (mediaPlanVersionsCache postgres path)
 * must overlay master-owned `mp_client_name` the same way `/api/mediaplans` does.
 */
describe("mediaPlanVersionsCache master-owned overlay (DI-9b)", () => {
  it("overlays mp_client_name from master onto postgres version rows by mba_number", () => {
    const versions = [
      {
        id: 831,
        mba_number: "jayco001",
        version_number: 7,
        campaign_name: "Jayco AU - Annual Plan",
        campaign_status: "booked",
        // intentionally absent: mp_client_name
      },
      {
        id: 900,
        mba_number: "bicau001",
        version_number: 3,
        campaign_status: "approved",
      },
    ]
    const masters = [
      { mba_number: "jayco001", mp_client_name: "Jayco", version_number: 7 },
      { mba_number: "bicau001", mp_client_name: "BIC", version_number: 3 },
    ]

    const rows = applyMasterOwnedOverlayByMba(versions, masters)

    assert.equal(rows.length, 2)
    assert.equal(rows[0].mp_client_name, "Jayco")
    assert.equal(rows[1].mp_client_name, "BIC")
    // latest-version scalars must not be rewritten by the overlay
    assert.equal(rows[0].version_number, 7)
    assert.equal(rows[0].campaign_status, "booked")
  })

  it("prefers an existing version mp_client_name over master", () => {
    const rows = applyMasterOwnedOverlayByMba(
      [{ id: 1, mba_number: "bicau001", mp_client_name: "BIC", version_number: 3 }],
      [{ mba_number: "bicau001", mp_client_name: "BIC Corp", version_number: 3 }],
    )
    assert.equal(rows[0].mp_client_name, "BIC")
  })

  it("keeps version rows with no matching master (does not drop)", () => {
    const rows = applyMasterOwnedOverlayByMba(
      [{ id: 1, mba_number: "orphan001", version_number: 1 }],
      [{ mba_number: "other001", mp_client_name: "Other" }],
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].mba_number, "orphan001")
    assert.equal(rows[0].mp_client_name, "")
  })

  it("shares the same overlay primitive as mediaPlansListCache", () => {
    const version = { id: 1, mba_number: "jayco001" }
    const master = { mba_number: "jayco001", mp_client_name: "Jayco" }
    assert.deepEqual(
      applyMasterOwnedOverlayByMba([version], [master])[0],
      overlayMasterOwnedListFields(version, master),
    )
  })
})
