import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

process.env.XANO_MEDIA_PLANS_BASE_URL = "https://xano.test"
process.env.XANO_MEDIAPLANS_BASE_URL = "https://xano.test"

type UnstableCacheCall = {
  keyParts: string[]
  revalidate: number
  tags: string[]
}

const unstableCacheCalls: UnstableCacheCall[] = []

const mockGet = mock.fn(async (..._args: unknown[]): Promise<{ data: unknown }> => ({ data: [] }))

const fakeAxios = {
  get: mockGet,
  post: mock.fn(async () => ({ data: {} })),
  put: mock.fn(async () => ({ data: {} })),
  patch: mock.fn(async () => ({ data: {} })),
  delete: mock.fn(async () => ({})),
  create: () => fakeAxios,
}

let getCachedMediaPlanVersions: typeof import("../mediaPlanVersionsCache.js").getCachedMediaPlanVersions
let MEDIA_PLAN_VERSIONS_TAG: typeof import("../mediaPlanVersionsCache.js").MEDIA_PLAN_VERSIONS_TAG
let getCachedMediaPlansList: typeof import("../mediaPlansListCache.js").getCachedMediaPlansList
let MEDIA_PLANS_LIST_TAG: typeof import("../mediaPlansListCache.js").MEDIA_PLANS_LIST_TAG

if (supportsMockModule()) {
  await mock.module!("server-only", {})
  await mock.module!("axios", {
    defaultExport: fakeAxios,
  })
  await mock.module!("next/cache", {
    namedExports: {
      unstable_cache: (
        fn: () => Promise<unknown>,
        keyParts: string[],
        opts: { revalidate: number; tags: string[] }
      ) => {
        unstableCacheCalls.push({
          keyParts: [...keyParts],
          revalidate: opts.revalidate,
          tags: [...opts.tags],
        })
        return fn
      },
      revalidateTag: () => {},
    },
  })

  ;({ getCachedMediaPlanVersions, MEDIA_PLAN_VERSIONS_TAG } = await import(
    "../mediaPlanVersionsCache.js"
  ))
  ;({ getCachedMediaPlansList, MEDIA_PLANS_LIST_TAG } = await import("../mediaPlansListCache.js"))
}

beforeEach(() => {
  if (!supportsMockModule()) return
  unstableCacheCalls.length = 0
  mockGet.mock.resetCalls()
  mock.method(console, "warn", () => {})
})

test("getCachedMediaPlanVersions uses 60s revalidate and strips schedules", { skip }, async () => {
  mockGet.mock.mockImplementation(async () => ({
    data: [
      {
        id: 1,
        mba_number: "MBA-1",
        version_number: 2,
        deliverySchedule: { junk: true },
        billing_schedule: { junk: true },
      },
    ],
  }))

  const result = await getCachedMediaPlanVersions()
  assert.equal(result.stale, false)
  assert.equal(result.data[0].mba_number, "MBA-1")
  assert.equal(result.data[0].deliverySchedule, undefined)
  assert.equal(result.data[0].billing_schedule, undefined)
  assert.ok(unstableCacheCalls.some((c) => c.keyParts[0] === "media-plan-versions"))
  assert.ok(unstableCacheCalls.some((c) => c.tags.includes(MEDIA_PLAN_VERSIONS_TAG)))
  assert.ok(unstableCacheCalls.every((c) => c.revalidate === 60))
})

test("getCachedMediaPlanVersions serves LKG with stale:true on failure", { skip }, async () => {
  mockGet.mock.mockImplementation(async () => ({
    data: [{ id: 1, mba_number: "MBA-WARM", version_number: 1 }],
  }))
  await getCachedMediaPlanVersions()

  mockGet.mock.mockImplementation(async () => {
    throw new Error("versions upstream down")
  })
  const stale = await getCachedMediaPlanVersions()
  assert.equal(stale.stale, true)
  assert.equal(stale.data[0].mba_number, "MBA-WARM")
})

test("getCachedMediaPlansList uses 60s revalidate and merges master version_number", { skip }, async () => {
  let call = 0
  mockGet.mock.mockImplementation(async (url: unknown) => {
    call += 1
    const href = String(url)
    if (href.includes("media_plan_versions")) {
      return {
        data: [{ id: 10, mba_number: "MBA-1", version_number: 3, name: "Plan" }],
      }
    }
    if (href.includes("media_plan_master")) {
      return {
        data: [{ mba_number: "MBA-1", version_number: 7 }],
      }
    }
    return { data: [] }
  })

  const result = await getCachedMediaPlansList()
  assert.equal(result.stale, false)
  assert.equal(result.data[0].mba_number, "MBA-1")
  assert.equal(result.data[0].version_number, 7)
  assert.ok(call >= 2)
  assert.ok(unstableCacheCalls.some((c) => c.keyParts[0] === "media-plans-list"))
  assert.ok(unstableCacheCalls.some((c) => c.tags.includes(MEDIA_PLANS_LIST_TAG)))
  assert.ok(
    unstableCacheCalls
      .filter((c) => c.keyParts[0] === "media-plans-list")
      .every((c) => c.revalidate === 60)
  )
})
