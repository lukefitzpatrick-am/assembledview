import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  planPreviewWork,
  previewBlobPathname,
  resolvePreviewClientId,
  runPreviewJob,
  type CachedPreviewRow,
  type PreviewAsset,
  type PreviewCacheUpsert,
  type PreviewJobDeps,
} from "@/lib/creative/previews/core"
import type { PreviewFetchResult } from "@/lib/creative/previews/fetchPreviewImage"
import { previewSourceHash } from "@/lib/creative/previews/sourceHash"

function metaUrl(id: string, oe = "6716A1B2", oh = "00_AAA"): string {
  return `https://scontent.xx.fbcdn.net/v/t45.1600-4/${id}_n.jpg?_nc_cat=1&oh=${oh}&oe=${oe}`
}

function asset(key: string, overrides: Partial<PreviewAsset> = {}): PreviewAsset {
  return {
    platform: "meta",
    creativeKey: key,
    previewImageUrl: metaUrl(key),
    previewKind: "image",
    viewUrl: `https://fb.me/${key}`,
    lastDeliveryDate: "2026-10-18",
    mbaNumbers: ["acme001"],
    ...overrides,
  }
}

function cachedFor(a: PreviewAsset, blobPathname: string | null = `creative-previews/meta/${a.creativeKey}.jpg`): CachedPreviewRow {
  return {
    platform: a.platform,
    creativeKey: a.creativeKey,
    sourceHash: previewSourceHash(a.previewImageUrl),
    blobPathname,
  }
}

const OK_IMAGE: PreviewFetchResult = {
  ok: true,
  image: { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg", ext: "jpg" },
}

type Harness = {
  deps: PreviewJobDeps
  fetched: string[]
  puts: string[]
  deletes: string[]
  upserts: PreviewCacheUpsert[]
  maxInFlight: () => number
}

function harness(
  assets: PreviewAsset[],
  cached: CachedPreviewRow[],
  fetchImage: (url: string) => Promise<PreviewFetchResult> = async () => OK_IMAGE,
  putFails = false,
): Harness {
  const fetched: string[] = []
  const puts: string[] = []
  const deletes: string[] = []
  const upserts: PreviewCacheUpsert[] = []
  let inFlight = 0
  let peak = 0
  return {
    fetched,
    puts,
    deletes,
    upserts,
    maxInFlight: () => peak,
    deps: {
      loadAssets: async () => assets,
      loadCached: async () => cached,
      loadClientByMba: async () => new Map([["acme001", 42]]),
      fetchImage: async (url) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        fetched.push(url)
        await new Promise((resolve) => setTimeout(resolve, 1))
        inFlight--
        return fetchImage(url)
      },
      putBlob: async (pathname) => {
        if (putFails) throw new Error("blob down")
        puts.push(pathname)
        return { pathname }
      },
      deleteBlob: async (pathname) => {
        deletes.push(pathname)
      },
      upsertRow: async (row) => {
        upserts.push(row)
      },
      now: () => new Date("2026-10-20T17:00:00Z"),
    },
  }
}

describe("planPreviewWork", () => {
  it("skips a creative whose cache row has the same source hash, even when re-signed", () => {
    const a = asset("1")
    const resigned = asset("1", { previewImageUrl: metaUrl("1", "671BE7C0", "00_ZZZ") })
    const plan = planPreviewWork([resigned], [cachedFor(a)])
    assert.equal(plan.todo.length, 0)
    assert.equal(plan.upToDate.length, 1)
  })

  it("fetches when there is no row, the source changed, or the row has no blob", () => {
    const fresh = asset("1")
    const changed = asset("2", { previewImageUrl: metaUrl("2-new") })
    const noBlob = asset("3")
    const plan = planPreviewWork(
      [fresh, changed, noBlob],
      [cachedFor(asset("2")), cachedFor(noBlob, null)],
    )
    assert.deepEqual(plan.todo.map((item) => item.asset.creativeKey).sort(), ["1", "2", "3"])
  })

  it("puts new creatives first, then the most recently delivered, and defers past the limit", () => {
    const old = asset("old", { lastDeliveryDate: "2026-10-01", previewImageUrl: metaUrl("old-new") })
    const recent = asset("recent", { lastDeliveryDate: "2026-10-19", previewImageUrl: metaUrl("recent-new") })
    const brandNew = asset("new", { lastDeliveryDate: "2026-09-25" })
    const plan = planPreviewWork([old, recent, brandNew], [cachedFor(asset("old")), cachedFor(asset("recent"))], 2)
    assert.deepEqual(plan.todo.map((item) => item.asset.creativeKey), ["new", "recent"])
    assert.deepEqual(plan.deferred.map((item) => item.asset.creativeKey), ["old"])
  })

  it("counts an unparsable preview URL as invalid", () => {
    const plan = planPreviewWork([asset("1", { previewImageUrl: "nope" })], [])
    assert.equal(plan.invalid.length, 1)
    assert.equal(plan.todo.length, 0)
  })
})

describe("resolvePreviewClientId", () => {
  const map = new Map([
    ["acme001", 42],
    ["acme002", 42],
    ["beta001", 7],
  ])
  it("returns the one client every MBA maps to", () => {
    assert.equal(resolvePreviewClientId(["ACME001", "acme002", "unknown9"], map), 42)
  })
  it("returns null for no mapped MBA or MBAs on two clients", () => {
    assert.equal(resolvePreviewClientId([], map), null)
    assert.equal(resolvePreviewClientId(["unknown9"], map), null)
    assert.equal(resolvePreviewClientId(["acme001", "beta001"], map), null)
  })
})

describe("previewBlobPathname", () => {
  it("is a fixed key per platform and creative", () => {
    assert.equal(previewBlobPathname("meta", "120210000000000001", "jpg"), "creative-previews/meta/120210000000000001.jpg")
    assert.equal(previewBlobPathname("tiktok", " 17/../x ", "webp"), "creative-previews/tiktok/17_.._x.webp")
  })
})

describe("runPreviewJob", () => {
  it("dry run fetches and writes nothing", async () => {
    const h = harness([asset("1"), asset("2")], [])
    const result = await runPreviewJob(h.deps, { days: 30, confirm: false })
    assert.equal(result.byPlatform.meta.wouldFetch, 2)
    assert.equal(h.fetched.length, 0)
    assert.equal(h.upserts.length, 0)
  })

  it("upserts only creatives whose source changed", async () => {
    const same = asset("1")
    const changed = asset("2", { previewImageUrl: metaUrl("2-new") })
    const h = harness([same, changed], [cachedFor(same), cachedFor(asset("2"))])
    const result = await runPreviewJob(h.deps, { days: 30, confirm: true })
    assert.deepEqual(h.upserts.map((row) => row.creativeKey), ["2"])
    assert.equal(result.totals.fetched, 1)
    assert.equal(result.totals.skipped, 1)
    const row = h.upserts[0]
    assert.equal(row.sourceHash, previewSourceHash(changed.previewImageUrl))
    assert.equal(row.clientId, 42)
    assert.equal(row.previewKind, "image")
    assert.equal(row.viewUrl, "https://fb.me/2")
    assert.equal(row.source, "platform")
    assert.equal(row.fetchedAt, "2026-10-20T17:00:00.000Z")
  })

  it("leaves the old row in place when the fetch fails", async () => {
    const changed = asset("2", { previewImageUrl: metaUrl("2-new") })
    const h = harness([changed], [cachedFor(asset("2"))], async () => ({ ok: false, reason: "http_error", detail: "403" }))
    const result = await runPreviewJob(h.deps, { days: 30, confirm: true })
    assert.equal(h.upserts.length, 0)
    assert.equal(h.puts.length, 0)
    assert.equal(h.deletes.length, 0)
    assert.equal(result.totals.failed, 1)
    assert.deepEqual(result.failures, [{ platform: "meta", creativeKey: "2", reason: "http_error: 403" }])
  })

  it("leaves the old row in place when the Blob write fails", async () => {
    const h = harness([asset("1")], [], undefined, true)
    const result = await runPreviewJob(h.deps, { days: 30, confirm: true })
    assert.equal(h.upserts.length, 0)
    assert.equal(result.totals.failed, 1)
  })

  it("fetches at most 300 per run, 6 at a time", async () => {
    const assets = Array.from({ length: 350 }, (_, i) => asset(String(i)))
    const h = harness(assets, [])
    const result = await runPreviewJob(h.deps, { days: 30, confirm: true })
    assert.equal(h.fetched.length, 300)
    assert.equal(result.totals.fetched, 300)
    assert.equal(result.totals.deferred, 50)
    assert.ok(h.maxInFlight() <= 6, `peak ${h.maxInFlight()}`)
    assert.equal(h.maxInFlight(), 6)
  })

  it("overwrites in place at the fixed key and deletes nothing when the key is unchanged", async () => {
    const changed = asset("9", { previewImageUrl: metaUrl("9-new") })
    const h = harness([changed], [cachedFor(asset("9"), "creative-previews/meta/9.jpg")])
    await runPreviewJob(h.deps, { days: 30, confirm: true })
    assert.deepEqual(h.puts, ["creative-previews/meta/9.jpg"])
    assert.equal(h.upserts[0].blobPathname, "creative-previews/meta/9.jpg")
    assert.deepEqual(h.deletes, [])
  })

  it("deletes the old blob when the extension changes", async () => {
    const changed = asset("9", { previewImageUrl: metaUrl("9-new") })
    const h = harness([changed], [cachedFor(asset("9"), "creative-previews/meta/9.png")])
    await runPreviewJob(h.deps, { days: 30, confirm: true })
    assert.deepEqual(h.puts, ["creative-previews/meta/9.jpg"])
    assert.deepEqual(h.deletes, ["creative-previews/meta/9.png"])
  })
})
