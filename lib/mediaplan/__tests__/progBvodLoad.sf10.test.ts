/**
 * SF-10 — Prog BVOD container load.
 *
 * Diagnostic: fieldMap shared-flag parity and spelling aliases are GREEN.
 * The RED tests encode the intended editor GET (dedicated tenant-scoped
 * `prog-bvod` route, same shape as prog-video). Leave them failing until
 * the next commit adds `app/api/media_plans/prog-bvod/route.ts` and points
 * `LINE_ITEM_BROWSER_API_PATH.progBvod` at `prog-bvod`.
 *
 * Do not import `containerChannelConfig` here — it pulls `lib/api.ts`, which
 * throws at module scope without Xano publisher env (BLAST-RADIUS).
 *
 * A one-line path change without that route is worse: `isChannelLineItemEndpoint("prog-bvod")`
 * is false, so catch-all would proxy Xano instead of postgres `line_items`.
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/progBvodLoad.sf10.test.ts
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import { isChannelLineItemEndpoint } from "@/lib/api/fetchChannelLineItemsByMba"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import { mapUiMediaTypeToLineChannel } from "@/lib/mediaplan/mapUiMediaTypeToLineChannel"
import { MBA_GET_LINE_ITEM_KEYS } from "@/lib/mediaplan/mbaGetAssemble"

type FieldFlags = {
  camel: string
  inDefaults: boolean
  inHydration: boolean
  inApi: boolean
}

function readRepo(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8")
}

function extractFieldMap(configName: string): FieldFlags[] {
  const src = readRepo("lib/mediaplan/containerChannelConfig.ts")
  const start = src.indexOf(`export const ${configName}`)
  assert.ok(start >= 0, `missing ${configName}`)
  const next = src.indexOf("\nexport const ", start + 1)
  const block = src.slice(start, next > start ? next : src.length)
  const entries: FieldFlags[] = []
  const re =
    /camel:\s*"(\w+)"[\s\S]*?inDefaults:\s*(true|false),\s*inHydration:\s*(true|false),\s*inApi:\s*(true|false)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block)) !== null) {
    entries.push({
      camel: match[1],
      inDefaults: match[2] === "true",
      inHydration: match[3] === "true",
      inApi: match[4] === "true",
    })
  }
  assert.ok(entries.length > 0, `${configName} fieldMap parsed empty`)
  return entries
}

function lineItemBrowserApiPath(key: string): string {
  const src = readRepo("lib/api.ts")
  const block = src.match(/const LINE_ITEM_BROWSER_API_PATH[^=]*=\s*\{([\s\S]*?)\n\}/)
  assert.ok(block, "LINE_ITEM_BROWSER_API_PATH object not found in lib/api.ts")
  const match = block[1].match(new RegExp(`\\b${key}:\\s*"([^"]+)"`))
  assert.ok(match, `LINE_ITEM_BROWSER_API_PATH missing key ${key}`)
  return match[1]
}

test("SF-10: shared progBvod fieldMap flags match progVideo", () => {
  const video = new Map(extractFieldMap("PROGVIDEO_CONTAINER_CONFIG").map((e) => [e.camel, e]))
  const bvod = new Map(extractFieldMap("PROGBVOD_CONTAINER_CONFIG").map((e) => [e.camel, e]))
  const shared = [...video.keys()].filter((camel) => bvod.has(camel))
  assert.ok(shared.length > 0, "expected overlapping field names")
  for (const camel of shared) {
    const v = video.get(camel)!
    const b = bvod.get(camel)!
    assert.deepEqual(
      { inDefaults: b.inDefaults, inHydration: b.inHydration, inApi: b.inApi },
      { inDefaults: v.inDefaults, inHydration: v.inHydration, inApi: v.inApi },
      `shared field ${camel} flag mismatch`,
    )
  }
})

test("SF-10: site and targetingAttribute are progVideo-only (not a shared-field gap)", () => {
  const videoCamels = new Set(extractFieldMap("PROGVIDEO_CONTAINER_CONFIG").map((e) => e.camel))
  const bvodCamels = new Set(extractFieldMap("PROGBVOD_CONTAINER_CONFIG").map((e) => e.camel))
  assert.equal(videoCamels.has("site"), true)
  assert.equal(videoCamels.has("targetingAttribute"), true)
  assert.equal(bvodCamels.has("site"), false)
  assert.equal(bvodCamels.has("targetingAttribute"), false)
  for (const camel of bvodCamels) {
    assert.ok(videoCamels.has(camel), `progBvod-only field ${camel} — unexpected vs progVideo`)
  }
})

test("SF-10: spelling aliases resolve to line_channel prog_bvod", () => {
  for (const key of ["progBvod", "progBVOD", "prog_bvod", "progbvod"]) {
    assert.equal(
      mapUiMediaTypeToLineChannel(key),
      "prog_bvod",
      `lookup miss for ${JSON.stringify(key)}`,
    )
  }
  assert.equal(MEDIA_TYPE_ID_CODES.progBVOD, "PB")
  assert.ok(
    (MBA_GET_LINE_ITEM_KEYS as readonly string[]).includes("progBvod"),
    "MBA GET bag key must be progBvod",
  )
})

test("SF-10: catch-all table name is a known postgres channel endpoint; kebab is not", () => {
  assert.equal(isChannelLineItemEndpoint("media_plan_prog_bvod"), true)
  assert.equal(
    isChannelLineItemEndpoint("prog-bvod"),
    false,
    "dedicated route must pass media_plan_prog_bvod into createChannelLineItemsGetHandler, not the URL segment",
  )
})

test("SF-10: progVideo already hydrates via dedicated prog-video GET", () => {
  assert.equal(lineItemBrowserApiPath("progVideo"), "prog-video")
  assert.equal(
    existsSync(join(process.cwd(), "app/api/media_plans/prog-video/route.ts")),
    true,
  )
})

test("SF-10: Prog BVOD editor GET must use dedicated prog-bvod route (not admin catch-all)", () => {
  assert.equal(
    lineItemBrowserApiPath("progBvod"),
    "prog-bvod",
    "LINE_ITEM_BROWSER_API_PATH.progBvod still points at media_plan_prog_bvod (admin-only catch-all)",
  )
  assert.equal(
    existsSync(join(process.cwd(), "app/api/media_plans/prog-bvod/route.ts")),
    true,
    "missing app/api/media_plans/prog-bvod/route.ts — copy prog-video and pass endpoint media_plan_prog_bvod",
  )
})
