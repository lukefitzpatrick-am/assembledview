/**
 * Two-shape download: Vercel Blob (private get) vs Xano vault http(s) fetch.
 * Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { Readable } from "node:stream"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getPrivateBlobMock = mock.fn(async (_urlOrPath: string) => ({
  statusCode: 200,
  stream: Readable.from([Buffer.from("blob-bytes")]),
  blob: { size: 10, contentType: "application/pdf" },
}))

if (supportsMockModule()) {
  await mock.module!("@/lib/creative/getPrivateBlob", {
    namedExports: {
      getPrivateBlob: getPrivateBlobMock,
    },
  })
}

const vercelBlobFile = {
  url: "https://abc.blob.vercel-storage.com/plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
  pathname: "plans/glenda008/v6/mba_pdf/Glendale_MBA_v6.pdf",
  name: "Glendale_MBA_v6.pdf",
  size: 10,
  mime: "application/pdf",
  uploadedAt: "2026-09-05T12:00:00.000Z",
  source: "vercel-blob",
}

const xanoVaultFile = {
  access: "public",
  path: "https://a2.xano.io/vault/mba.pdf",
  name: "Glendale_MBA_v6.pdf",
  type: "pdf",
  size: 10,
  mime: "application/pdf",
  meta: {},
}

test("servePlanFileAttachment — Vercel Blob url streams via getPrivateBlob", { skip }, async () => {
  getPrivateBlobMock.mock.resetCalls()
  getPrivateBlobMock.mock.mockImplementation(async () => ({
    statusCode: 200,
    stream: Readable.from([Buffer.from("blob-bytes")]),
    blob: { size: 10, contentType: "application/pdf" },
  }))

  const { servePlanFileAttachment } = await import("../servePlanFile.js")
  const res = await servePlanFileAttachment(vercelBlobFile)
  assert.equal(res.status, 200)
  assert.match(res.headers.get("Content-Disposition") ?? "", /Glendale_MBA_v6\.pdf/)
  assert.equal(getPrivateBlobMock.mock.calls.length, 1)
  assert.equal(
    getPrivateBlobMock.mock.calls[0]!.arguments[0],
    vercelBlobFile.pathname,
  )
})

test("servePlanFileAttachment — Xano vault http(s) path uses fetch pass-through", { skip }, async () => {
  getPrivateBlobMock.mock.resetCalls()
  const originalFetch = globalThis.fetch
  const fetchMock = mock.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    assert.equal(url, xanoVaultFile.path)
    return new Response(Buffer.from("xano-bytes"), {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  try {
    const { servePlanFileAttachment } = await import("../servePlanFile.js")
    const res = await servePlanFileAttachment(xanoVaultFile)
    assert.equal(res.status, 200)
    assert.match(res.headers.get("Content-Disposition") ?? "", /Glendale_MBA_v6\.pdf/)
    assert.equal(getPrivateBlobMock.mock.calls.length, 0)
    assert.equal(fetchMock.mock.calls.length, 1)
    const body = Buffer.from(await res.arrayBuffer())
    assert.equal(body.toString(), "xano-bytes")
  } finally {
    globalThis.fetch = originalFetch
  }
})
