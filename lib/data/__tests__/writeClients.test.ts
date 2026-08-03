import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  CLIENT_MIRROR_FAILURE_KIND,
  buildClientMirrorFailurePayload,
  buildXanoClientMirrorPayload,
  normalizeClientWritePayload,
  resolveClientIdForMaster,
} from "../writeClients"

describe("normalizeClientWritePayload", () => {
  it("maps name aliases to mp_client_name and drops empties", () => {
    const out = normalizeClientWritePayload({
      clientname_input: "Acme Co",
      mbaidentifier: "acme",
      abn: "",
      website: "https://acme.test",
      unknown_junk: "x",
    })
    assert.equal(out.mp_client_name, "Acme Co")
    assert.equal(out.mbaidentifier, "acme")
    assert.equal(out.website, "https://acme.test")
    assert.equal(out.abn, undefined)
    assert.equal((out as Record<string, unknown>).unknown_junk, undefined)
  })

  it("requires mp_client_name and mbaidentifier", () => {
    assert.throws(
      () => normalizeClientWritePayload({ mbaidentifier: "x" }),
      /mp_client_name/
    )
    assert.throws(
      () => normalizeClientWritePayload({ mp_client_name: "Acme" }),
      /mbaidentifier/
    )
  })
})

describe("buildXanoClientMirrorPayload", () => {
  it("includes PG id so Xano stays aligned", () => {
    const payload = buildXanoClientMirrorPayload(42, {
      mp_client_name: "Acme",
      mbaidentifier: "acme",
    })
    assert.equal(payload.id, 42)
    assert.equal(payload.mp_client_name, "Acme")
    assert.equal(payload.client_name, "Acme")
  })
})

describe("buildClientMirrorFailurePayload", () => {
  it("shapes app_notifications payload for create", () => {
    const p = buildClientMirrorFailurePayload({
      op: "create",
      clientId: 53,
      error: "upstream 500",
      at: new Date("2026-08-02T00:00:00.000Z"),
    })
    assert.equal(p.op, "create")
    assert.equal(p.clientId, 53)
    assert.equal(p.error, "upstream 500")
    assert.equal(p.timestamp, "2026-08-02T00:00:00.000Z")
    assert.equal(p.retried, false)
    assert.equal(CLIENT_MIRROR_FAILURE_KIND, "xano_client_mirror_failed")
  })
})

describe("resolveClientIdForMaster", () => {
  it("prefers explicit positive clientId when present in PG", async () => {
    const id = await resolveClientIdForMaster(
      { clientId: 7, mpClientName: "Other" },
      {
        findById: async (n) => (n === 7 ? { id: 7 } : null),
        findByName: async () => ({ id: 99 }),
      }
    )
    assert.equal(id, 7)
  })

  it("falls back to mp_client_name lookup when clientId missing/invalid", async () => {
    const id = await resolveClientIdForMaster(
      { clientId: null, mpClientName: "Acme Co" },
      {
        findById: async () => null,
        findByName: async (name) =>
          name === "Acme Co" ? { id: 12 } : null,
      }
    )
    assert.equal(id, 12)
  })

  it("returns null when neither resolves", async () => {
    const id = await resolveClientIdForMaster(
      { clientId: 999, mpClientName: "Nope" },
      {
        findById: async () => null,
        findByName: async () => null,
      }
    )
    assert.equal(id, null)
  })
})
