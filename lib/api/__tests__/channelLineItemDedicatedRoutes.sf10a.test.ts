/**
 * SF-10a — every channel line-item GET goes through a dedicated tenant-scoped
 * route (`checkClientMbaAccess`), never the admin-only catch-all.
 *
 * Do not import `lib/api.ts` here — it throws at module scope without Xano
 * publisher env (BLAST-RADIUS). Parse LINE_ITEM_BROWSER_API_PATH from source.
 *
 * Run: npx tsx --test lib/api/__tests__/channelLineItemDedicatedRoutes.sf10a.test.ts
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import {
  isChannelLineItemEndpoint,
  resolveChannelLineItemEndpoint,
} from "@/lib/api/fetchChannelLineItemsByMba"

const ROOT = process.cwd()

/** Eight channels that still hit the admin catch-all before this commit. */
const SF10A_DEDICATED: ReadonlyArray<{
  browserKey: string
  segment: string
  endpoint: string
  logTag: string
}> = [
  { browserKey: "progBvod", segment: "prog-bvod", endpoint: "media_plan_prog_bvod", logTag: "PROG_BVOD" },
  { browserKey: "progAudio", segment: "prog-audio", endpoint: "media_plan_prog_audio", logTag: "PROG_AUDIO" },
  { browserKey: "radio", segment: "radio", endpoint: "media_plan_radio", logTag: "RADIO" },
  { browserKey: "magazines", segment: "magazines", endpoint: "media_plan_magazines", logTag: "MAGAZINES" },
  { browserKey: "ooh", segment: "ooh", endpoint: "media_plan_ooh", logTag: "OOH" },
  { browserKey: "digitalDisplay", segment: "digi-display", endpoint: "media_plan_digi_display", logTag: "DIGI_DISPLAY" },
  { browserKey: "digitalAudio", segment: "digi-audio", endpoint: "media_plan_digi_audio", logTag: "DIGI_AUDIO" },
  { browserKey: "digitalVideo", segment: "digi-video", endpoint: "media_plan_digi_video", logTag: "DIGI_VIDEO" },
]

function lineItemBrowserApiPath(): Record<string, string> {
  const src = readFileSync(join(ROOT, "lib/api.ts"), "utf8")
  const block = src.match(/const LINE_ITEM_BROWSER_API_PATH[^=]*=\s*\{([\s\S]*?)\n\}/)
  assert.ok(block, "LINE_ITEM_BROWSER_API_PATH object not found in lib/api.ts")
  const out: Record<string, string> = {}
  const re = /(\w+):\s*"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block[1])) !== null) {
    out[match[1]] = match[2]
  }
  assert.ok(Object.keys(out).length > 0, "LINE_ITEM_BROWSER_API_PATH parsed empty")
  return out
}

function dedicatedRoutePath(segment: string): string {
  return join(ROOT, "app/api/media_plans", segment, "route.ts")
}

function parseHandlerArgs(segment: string): { endpoint: string; logTag: string } | null {
  const file = dedicatedRoutePath(segment)
  if (!existsSync(file)) return null
  const src = readFileSync(file, "utf8")
  const match = src.match(
    /createChannelLineItemsGetHandler\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/,
  )
  if (!match) return null
  return { endpoint: match[1], logTag: match[2] }
}

test("SF-10a: every LINE_ITEM_BROWSER_API_PATH value has a dedicated route (not catch-all)", () => {
  const paths = lineItemBrowserApiPath()
  const missing: string[] = []
  const stillCatchAll: string[] = []
  for (const [key, segment] of Object.entries(paths)) {
    if (segment.startsWith("media_plan_")) {
      stillCatchAll.push(`${key}=${segment}`)
      continue
    }
    if (!existsSync(dedicatedRoutePath(segment))) {
      missing.push(`${key} → ${segment}`)
    }
  }
  assert.deepEqual(
    stillCatchAll,
    [],
    "LINE_ITEM_BROWSER_API_PATH still points at media_plan_* (admin-only catch-all)",
  )
  assert.deepEqual(missing, [], "dedicated route.ts missing for LINE_ITEM_BROWSER_API_PATH segment")
})

test("SF-10a: the eight catch-all channels get dedicated kebab routes + table endpoints", () => {
  const paths = lineItemBrowserApiPath()
  for (const row of SF10A_DEDICATED) {
    assert.equal(
      paths[row.browserKey],
      row.segment,
      `LINE_ITEM_BROWSER_API_PATH.${row.browserKey} must be ${row.segment}`,
    )
    assert.equal(
      existsSync(dedicatedRoutePath(row.segment)),
      true,
      `missing app/api/media_plans/${row.segment}/route.ts`,
    )
    const args = parseHandlerArgs(row.segment)
    assert.ok(args, `${row.segment}/route.ts must call createChannelLineItemsGetHandler`)
    assert.equal(args.endpoint, row.endpoint)
    assert.equal(args.logTag, row.logTag)
    assert.equal(
      isChannelLineItemEndpoint(args.endpoint),
      true,
      `handler must pass table name ${row.endpoint}, not the URL segment`,
    )
  }
})

test("SF-10a: isChannelLineItemEndpoint stays table-name-only; kebab resolves via map", () => {
  for (const row of SF10A_DEDICATED) {
    assert.equal(isChannelLineItemEndpoint(row.endpoint), true)
    assert.equal(
      isChannelLineItemEndpoint(row.segment),
      false,
      `kebab ${row.segment} is not a postgres endpoint — dedicated route must pass ${row.endpoint}`,
    )
    assert.equal(resolveChannelLineItemEndpoint(row.segment), row.endpoint)
    assert.equal(resolveChannelLineItemEndpoint(row.endpoint), row.endpoint)
  }
})

test("SF-10a: no extra dedicated channel folders beyond LINE_ITEM_BROWSER_API_PATH + catch-all", () => {
  const paths = lineItemBrowserApiPath()
  const expected = new Set(Object.values(paths))
  const dir = join(ROOT, "app/api/media_plans")
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory() || name.name.startsWith("[")) continue
    if (name.name === "route.ts") continue
    const hasRoute = existsSync(join(dir, name.name, "route.ts"))
    if (!hasRoute) continue
    assert.ok(
      expected.has(name.name),
      `unexpected dedicated folder app/api/media_plans/${name.name} not in LINE_ITEM_BROWSER_API_PATH`,
    )
  }
})
