import assert from "node:assert/strict"
import test from "node:test"

import type { MediaContainerBestPractice, Publisher } from "@/lib/types/publisher"
import {
  resolveNamingReferenceData,
  type NamingReferenceOverride,
  type ResolveNamingReferenceDeps,
} from "../generateFromPostedPlan.js"

function deps(partial: {
  fetchPublishers?: () => Promise<unknown[]>
  fetchBestPractice?: () => Promise<unknown[]>
}): ResolveNamingReferenceDeps {
  return {
    fetchPublishers: partial.fetchPublishers as
      | (() => Promise<Publisher[]>)
      | undefined,
    fetchBestPractice: partial.fetchBestPractice as
      | (() => Promise<MediaContainerBestPractice[]>)
      | undefined,
  }
}

test("resolveNamingReferenceData: fetches publishers + best practice when body omits them", async () => {
  const fetchedPubs = [{ id: 1, publisher_name: "Nine" }]
  const fetchedBp = [{ media_container: "search", is_active: true }]
  const result = await resolveNamingReferenceData(
    {},
    deps({
      fetchPublishers: async () => fetchedPubs,
      fetchBestPractice: async () => fetchedBp,
    }),
  )
  assert.deepEqual(result.publishers, fetchedPubs)
  assert.deepEqual(result.containerBestPractice, fetchedBp)
  assert.equal(result.source.publishers, "server")
  assert.equal(result.source.containerBestPractice, "server")
})

test("resolveNamingReferenceData: body override wins over server fetch", async () => {
  const override: NamingReferenceOverride = {
    publishers: [{ id: 9, publisher_name: "Override Pub" }] as Publisher[],
    containerBestPractice: [
      { media_container: "socialMedia", is_active: true },
    ] as MediaContainerBestPractice[],
  }
  const result = await resolveNamingReferenceData(
    override,
    deps({
      fetchPublishers: async () => [{ id: 1, publisher_name: "Server Pub" }],
      fetchBestPractice: async () => [
        { media_container: "search", is_active: true },
      ],
    }),
  )
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
    deps({
      fetchPublishers: async () => [{ id: 3 }],
      fetchBestPractice: async () => [{ media_container: "progDisplay" }],
    }),
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
