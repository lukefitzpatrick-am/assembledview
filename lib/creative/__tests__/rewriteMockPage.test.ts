import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { rewriteMockPage } from "@/lib/creative/mockPage/rewritePage"

describe("rewriteMockPage", () => {
  it("strips scripts and on* handlers", () => {
    const html = `<!doctype html><html><head>
      <meta http-equiv="Content-Security-Policy" content="default-src *" />
      <script>alert(1)</script>
    </head><body>
      <div id="div-gpt-ad-x" style="width:300px;height:250px" onclick="evil()"></div>
      <img src="x" onerror="evil()" />
    </body></html>`
    const { html: out } = rewriteMockPage(html, "https://example.com/a", null)
    assert.equal(/<script/i.test(out), false)
    assert.equal(/onclick=/i.test(out), false)
    assert.equal(/onerror=/i.test(out), false)
    assert.equal(/Content-Security-Policy/i.test(out), false)
    assert.match(out, /<base href="https:\/\/example\.com\/a"/)
  })

  it("replaces GPT slots and injects matching creative", () => {
    const html = `<!doctype html><html><body>
      <div id="div-gpt-ad-123" style="width:300px;height:250px"></div>
      <div id="div-gpt-ad-456" style="width:728px;height:90px"></div>
    </body></html>`
    const { html: out, slots } = rewriteMockPage(html, "https://news.example/", {
      id: 42,
      mime_type: "image/png",
      width_px: 300,
      height_px: 250,
      asset_name: "MREC",
    })
    assert.equal(slots.length, 2)
    assert.equal(slots.filter((s) => s.matched).length, 1)
    assert.match(out, /data-av-slot="300x250"/)
    assert.match(out, /data-av-slot="728x90"/)
    assert.match(out, /\/api\/creative-assets\/42\/download/)
    const emptyLeader = out.match(/data-av-slot="728x90"[^>]*>([\s\S]*?)<\/div>/)
    assert.ok(emptyLeader)
    assert.equal((emptyLeader![1] || "").includes("<img"), false)
  })

  it("leaves unmatched slots empty", () => {
    const html = `<div class="mrec-ad" style="width:300px;height:250px"></div>`
    const { slots } = rewriteMockPage(html, "https://example.com/", {
      id: 1,
      mime_type: "image/jpeg",
      width_px: 970,
      height_px: 250,
      asset_name: "Billboard",
    })
    assert.equal(slots.length, 1)
    assert.equal(slots[0]!.matched, false)
  })
})
