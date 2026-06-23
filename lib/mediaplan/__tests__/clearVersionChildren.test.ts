import assert from "node:assert/strict"
import { test } from "node:test"

import { clearVersionChildren } from "../clearVersionChildren.js"

test("clearVersionChildren only deletes rows matching MBA and version 1 guard", async () => {
  const deletedUrls: string[] = []
  const getCounts = new Map<string, number>()

  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? "GET"

    if (method === "DELETE") {
      deletedUrls.push(url)
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }

    const slug = url.match(/\/api\/media_plans\/([^?]+)/)?.[1] ?? ""
    const count = getCounts.get(slug) ?? 0
    getCounts.set(slug, count + 1)

    if (slug !== "media_plan_search" || count > 0) {
      return new Response(JSON.stringify([]), { status: 200 })
    }

    return new Response(
      JSON.stringify({
        items: [
          { id: 1, mba_number: " mba-1 ", media_plan_version: 111 },
          { id: 2, mba_number: "MBA-1", version_number: "1" },
          { id: 3, mba_number: "MBA-1", mp_plannumber: "1" },
          { id: 4, mba_number: "MBA-2", media_plan_version: 111 },
          { id: 5, mba_number: "MBA-1", media_plan_version: 222 },
          { id: 6, mba_number: "MBA-1", version_number: "2" },
        ],
      }),
      { status: 200 },
    )
  }

  const result = await clearVersionChildren("MBA-1", 111, { fetcher })

  assert.equal(result.media_plan_search.deleted, 3)
  assert.equal(result.media_plan_search.skipped, 3)
  assert.deepEqual(deletedUrls, [
    "/api/media_plans/media_plan_search/1",
    "/api/media_plans/media_plan_search/2",
    "/api/media_plans/media_plan_search/3",
  ])
})
