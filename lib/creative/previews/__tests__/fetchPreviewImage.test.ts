import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  fetchPreviewImage,
  imageTypeFrom,
  isAllowedPreviewHost,
  PREVIEW_MAX_BYTES,
  previewFetchUrl,
} from "@/lib/creative/previews/fetchPreviewImage"

const OK_URL = "https://scontent.xx.fbcdn.net/v/t45/1_n.jpg?oe=1"

function imageResponse(bytes: number, headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "image/jpeg", ...headers },
  })
}

function streamedResponse(chunks: number, chunkSize: number): Response {
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) {
        controller.close()
        return
      }
      sent++
      controller.enqueue(new Uint8Array(chunkSize))
    },
  })
  return new Response(body, { status: 200, headers: { "content-type": "image/png" } })
}

describe("isAllowedPreviewHost", () => {
  it("allows subdomains of the four CDN hosts over https", () => {
    for (const url of [
      "https://scontent.xx.fbcdn.net/a.jpg",
      "https://scontent-syd2-1.xx.fbcdn.net/a.jpg",
      "https://p16-sign-va.tiktokcdn.com/a.image",
      "https://p16-sign.tiktokcdn-us.com/a.image",
      "https://p16-ad-sg.byteimg.com/a.jpeg",
    ]) {
      assert.equal(isAllowedPreviewHost(url), true, url)
    }
  })

  it("refuses other hosts, bare suffixes, look-alikes, http, ports and credentials", () => {
    for (const url of [
      "https://example.com/a.jpg",
      "https://fbcdn.net/a.jpg",
      "https://evilfbcdn.net/a.jpg",
      "https://fbcdn.net.evil.com/a.jpg",
      "https://p16.ibyteimg.com/a.jpg",
      "http://scontent.xx.fbcdn.net/a.jpg",
      "https://scontent.xx.fbcdn.net:8443/a.jpg",
      "https://user:pw@scontent.xx.fbcdn.net/a.jpg",
      "not a url",
    ]) {
      assert.equal(isAllowedPreviewHost(url), false, url)
    }
  })
})

describe("previewFetchUrl", () => {
  it("upgrades http to https on an allowlisted host (TikTok covers arrive as http)", () => {
    assert.equal(
      previewFetchUrl("http://p16-common-sign.tiktokcdn.com/obj/cover.image?x-expires=1"),
      "https://p16-common-sign.tiktokcdn.com/obj/cover.image?x-expires=1",
    )
  })

  it("leaves an http URL on any other host unchanged, so the https-only check refuses it", () => {
    const raw = "http://example.com/a.jpg"
    assert.equal(previewFetchUrl(raw), raw)
    assert.equal(isAllowedPreviewHost(previewFetchUrl(raw)), false)
  })
})

describe("imageTypeFrom", () => {
  it("accepts image types and maps the extension", () => {
    assert.deepEqual(imageTypeFrom("image/jpeg; charset=binary"), { contentType: "image/jpeg", ext: "jpg" })
    assert.deepEqual(imageTypeFrom("image/webp"), { contentType: "image/webp", ext: "webp" })
  })

  it("refuses non-images and svg", () => {
    assert.equal(imageTypeFrom("text/html"), null)
    assert.equal(imageTypeFrom("image/svg+xml"), null)
    assert.equal(imageTypeFrom(null), null)
  })
})

describe("fetchPreviewImage", () => {
  it("does not call fetch for a host outside the allowlist", async () => {
    let called = 0
    const result = await fetchPreviewImage("https://example.com/a.jpg", {
      fetchImpl: async () => {
        called++
        return imageResponse(10)
      },
    })
    assert.deepEqual(result, { ok: false, reason: "host_not_allowed", detail: "example.com" })
    assert.equal(called, 0)
  })

  it("refuses a redirect to a host outside the allowlist", async () => {
    const result = await fetchPreviewImage(OK_URL, {
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://evil.example/x.jpg" } }),
    })
    assert.equal(result.ok, false)
    assert.equal(!result.ok && result.reason, "host_not_allowed")
  })

  it("refuses a response that is not an image", async () => {
    const result = await fetchPreviewImage(OK_URL, {
      fetchImpl: async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    })
    assert.equal(!result.ok && result.reason, "not_image")
  })

  it("refuses a declared size over 5 MB without reading the body", async () => {
    const result = await fetchPreviewImage(OK_URL, {
      fetchImpl: async () => imageResponse(10, { "content-length": String(PREVIEW_MAX_BYTES + 1) }),
    })
    assert.equal(!result.ok && result.reason, "too_large")
  })

  it("stops reading a streamed body once it passes the cap", async () => {
    const result = await fetchPreviewImage(OK_URL, {
      maxBytes: 1000,
      fetchImpl: async () => streamedResponse(10, 300),
    })
    assert.equal(!result.ok && result.reason, "too_large")
  })

  it("times out", async () => {
    const result = await fetchPreviewImage(OK_URL, {
      timeoutMs: 20,
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        }),
    })
    assert.equal(!result.ok && result.reason, "timeout")
  })

  it("returns the bytes, type and extension for an allowed image", async () => {
    const result = await fetchPreviewImage(OK_URL, { fetchImpl: async () => imageResponse(1234) })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.image.bytes.byteLength, 1234)
      assert.equal(result.image.contentType, "image/jpeg")
      assert.equal(result.image.ext, "jpg")
    }
  })

  it("fetches an http TikTok cover over https", async () => {
    const seen: string[] = []
    const result = await fetchPreviewImage("http://p16-common-sign.tiktokcdn.com/obj/c.image", {
      fetchImpl: async (input) => {
        seen.push(String(input))
        return imageResponse(10)
      },
    })
    assert.equal(result.ok, true)
    assert.deepEqual(seen, ["https://p16-common-sign.tiktokcdn.com/obj/c.image"])
  })

  it("reports a non-2xx status", async () => {
    const result = await fetchPreviewImage(OK_URL, { fetchImpl: async () => new Response(null, { status: 403 }) })
    assert.deepEqual(result, { ok: false, reason: "http_error", detail: "403" })
  })
})
