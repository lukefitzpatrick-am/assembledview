import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { NextRequest } from "next/server"

import { assertClientAccess, type AssertClientAccessDeps } from "@/lib/auth/assertClientAccess"
import type { ClientGroup } from "@/lib/clients/clientGroup"
import { previewCacheGate, PREVIEW_MARKER_0098, PREVIEW_MARKER_0102 } from "@/lib/creative/previews/gate"
import { PREVIEW_CACHE_CONTROL, servePreviewImage, type ServePreviewDeps, type ServedPreviewRow } from "@/lib/creative/previews/serve"

const READY = previewCacheGate([PREVIEW_MARKER_0098, PREVIEW_MARKER_0102])

function group(ids: number[]): ClientGroup {
  return {
    anchor: { id: ids[0] },
    members: ids.map((id) => ({ id })),
    mbaidentifier: "acme",
    nameSlugs: new Set(["acme"]),
  }
}

function accessDeps(roles: string[], clientIds: number[]): AssertClientAccessDeps {
  return {
    getSession: async () => ({ user: { email: "u@example.com" } }),
    getUserRoles: () => roles,
    getUserClientSlugs: () => ["acme"],
    fetchClientGroupBySlug: async () => group(clientIds),
  }
}

function deps(
  row: ServedPreviewRow | null,
  access: AssertClientAccessDeps,
  overrides: Partial<ServePreviewDeps> = {},
): ServePreviewDeps & { blobReads: string[] } {
  const blobReads: string[] = []
  const request = new NextRequest("http://localhost/api/creative-previews/meta/1")
  return {
    blobReads,
    gate: async () => READY,
    readRow: async () => row,
    checkAccess: (clientId) => assertClientAccess(request, clientId, access),
    getBlob: async (pathname) => {
      blobReads.push(pathname)
      return {
        stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
        contentType: "image/jpeg",
      }
    },
    ...overrides,
  }
}

const ROW: ServedPreviewRow = { clientId: 42, blobPathname: "creative-previews/meta/1.jpg", mimeType: "image/jpeg" }

describe("servePreviewImage", () => {
  it("streams the image to a user of the row's client with private caching", async () => {
    const d = deps(ROW, accessDeps(["client"], [42]))
    const res = await servePreviewImage({ platform: "meta", creativeKey: "1" }, d)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get("cache-control"), PREVIEW_CACHE_CONTROL)
    assert.equal(res.headers.get("cache-control"), "private, max-age=86400")
    assert.equal(res.headers.get("content-type"), "image/jpeg")
    assert.equal(new Uint8Array(await res.arrayBuffer()).byteLength, 3)
  })

  it("refuses another client's user without reading the blob", async () => {
    const d = deps(ROW, accessDeps(["client"], [7]))
    const res = await servePreviewImage({ platform: "meta", creativeKey: "1" }, d)
    assert.equal(res.status, 403)
    assert.deepEqual(d.blobReads, [])
  })

  it("serves an admin any row, including one with no client", async () => {
    const d = deps({ ...ROW, clientId: null }, accessDeps(["admin"], []))
    const res = await servePreviewImage({ platform: "meta", creativeKey: "1" }, d)
    assert.equal(res.status, 200)
  })

  it("refuses a client user a row with no client", async () => {
    const d = deps({ ...ROW, clientId: null }, accessDeps(["client"], [42]))
    const res = await servePreviewImage({ platform: "meta", creativeKey: "1" }, d)
    assert.equal(res.status, 403)
  })

  it("404s when there is no row", async () => {
    const d = deps(null, accessDeps(["admin"], []))
    const res = await servePreviewImage({ platform: "meta", creativeKey: "1" }, d)
    assert.equal(res.status, 404)
  })

  it("404s when the row has no blob", async () => {
    const d = deps({ ...ROW, blobPathname: null }, accessDeps(["admin"], []))
    const res = await servePreviewImage({ platform: "meta", creativeKey: "1" }, d)
    assert.equal(res.status, 404)
  })

  it("404s for an unknown platform", async () => {
    const d = deps(ROW, accessDeps(["admin"], []))
    const res = await servePreviewImage({ platform: "cm360", creativeKey: "1" }, d)
    assert.equal(res.status, 404)
  })

  it("does nothing and 404s until 0102 is applied", async () => {
    let reads = 0
    const d = deps(ROW, accessDeps(["admin"], []), {
      gate: async () => previewCacheGate([PREVIEW_MARKER_0098]),
      readRow: async () => {
        reads++
        return ROW
      },
    })
    const res = await servePreviewImage({ platform: "meta", creativeKey: "1" }, d)
    assert.equal(res.status, 404)
    assert.equal(reads, 0)
  })
})

describe("previewCacheGate", () => {
  it("names the missing marker", () => {
    assert.deepEqual(previewCacheGate([]), { ready: false, message: "0098 not applied" })
    assert.deepEqual(previewCacheGate([PREVIEW_MARKER_0098]), { ready: false, message: "0102 not applied" })
    assert.deepEqual(previewCacheGate([PREVIEW_MARKER_0098, PREVIEW_MARKER_0102]), { ready: true })
  })
})
