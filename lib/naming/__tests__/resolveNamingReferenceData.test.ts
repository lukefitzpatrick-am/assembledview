import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveNamingReferenceData,
  type NamingReferenceOverride,
} from "../generateFromPostedPlan.js"

test("resolveNamingReferenceData: fetches publishers + best practice when body omits them", async () => {
  const fetchedPubs = [{ id: 1, publisher_name: "Nine" }]
  const fetchedBp = [{ media_container: "search", is_active: true }]
  const result = await resolveNamingReferenceData(
    {},
    {
      fetchPublishers: async () => fetchedPubs,
      fetchBestPractice: async () => fetchedBp,
    },
  )
  assert.deepEqual(result.publishers, fetchedPubs)
  assert.deepEqual(result.containerBestPractice, fetchedBp)
  assert.equal(result.source.publishers, "server")
  assert.equal(result.source.containerBestPractice, "server")
})

test("resolveNamingReferenceData: body override wins over server fetch", async () => {
  const override: NamingReferenceOverride = {
    publishers: [{ id: 9, publisher_name: "Override Pub" }],
    containerBestPractice: [
      { media_container: "socialMedia", is_active: true } as never,
    ],
  }
  const result = await resolveNamingReferenceData(override, {
    fetchPublishers: async () => [{ id: 1, publisher_name: "Server Pub" }],
    fetchBestPractice: async () => [
      { media_container: "search", is_active: true },
    ],
  })
  assert.equal((result.publishers[0] as { id: number }).id, 9)
  assert.equal(
    (result.containerBestPractice[0] as { media_container: string })
      .media_container,
    "socialMedia",
  )
  assert.equal(result.source.publishers, "body")
  assert.equal(result.source.containerBestPractice, "body")
})

test("resolveNamingReferenceData: empty body arrays fall back to server", async () => {
  const result = await resolveNamingReferenceData(
    { publishers: [], containerBestPractice: [] },
    {
      fetchPublishers: async () => [{ id: 3 }],
      fetchBestPractice: async () => [{ media_container: "progDisplay" }],
    },
  )
  assert.equal((result.publishers[0] as { id: number }).id, 3)
  assert.equal(
    (result.containerBestPractice[0] as { media_container: string })
      .media_container,
    "progDisplay",
  )
  assert.equal(result.source.publishers, "server")
  assert.equal(result.source.containerBestPractice, "server")
})
