/**
 * Phase 0 / Phase 4 wall-clock timings for page-speed pass.
 * Hits Xano upstream (same work Next routes proxy) and optionally Next APIs if COOKIE is set.
 *
 * Usage: node scripts/page-speed-baseline.mjs
 * Optional: NEXT_COOKIE="appSession=..." node scripts/page-speed-baseline.mjs
 */
import fs from "fs"
import axios from "axios"

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m) continue
  let v = m[2]
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  if (!process.env[m[1]]) process.env[m[1]] = v
}

const media = (
  process.env.XANO_MEDIA_PLANS_BASE_URL ||
  process.env.XANO_MEDIAPLANS_BASE_URL ||
  ""
).replace(/\/$/, "")
const pub = (process.env.XANO_PUBLISHERS_BASE_URL || "").replace(/\/$/, "")
const nextBase = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "")
const cookie = process.env.NEXT_COOKIE || ""

function authHeaders() {
  return process.env.XANO_API_KEY
    ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` }
    : {}
}

async function time(label, fn) {
  const t0 = Date.now()
  try {
    const r = await fn()
    const row = {
      label,
      ms: Date.now() - t0,
      ok: true,
      bytes: r?.bytes,
      extra: r?.extra,
    }
    console.log(JSON.stringify(row))
    return row
  } catch (e) {
    const row = {
      label,
      ms: Date.now() - t0,
      ok: false,
      err: e.response?.status || e.message,
    }
    console.log(JSON.stringify(row))
    return row
  }
}

async function pagedWalk(url, params, label, maxPages = 50) {
  let page = 1
  let totalBytes = 0
  let totalItems = 0
  const t0 = Date.now()
  for (; page <= maxPages; page++) {
    const res = await axios.get(url, {
      params: { ...params, page, per_page: 100 },
      headers: authHeaders(),
      timeout: 180000,
    })
    const raw = JSON.stringify(res.data)
    totalBytes += raw.length
    const items = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res.data?.items)
        ? res.data.items
        : Array.isArray(res.data?.data)
          ? res.data.data
          : []
    totalItems += items.length
    const next =
      res.data && typeof res.data === "object" && !Array.isArray(res.data)
        ? res.data.nextPage
        : null
    if (next == null || next === "" || Number(next) <= 0) break
    if (!Array.isArray(res.data) && items.length === 0) break
    if (Array.isArray(res.data) && items.length < 100) break
  }
  return {
    bytes: totalBytes,
    extra: `${label} pages=${page} items≈${totalItems} walkMs=${Date.now() - t0}`,
  }
}

console.log(
  JSON.stringify({
    phase: "baseline",
    mediaTail: media.slice(-24),
    pubTail: pub.slice(-24),
    nextBase,
    hasCookie: Boolean(cookie),
  })
)

await time("xano latest paged include_schedules=false", () =>
  pagedWalk(
    `${media}/media_plan_versions_latest`,
    { include_schedules: false },
    "latest-no-sched"
  )
)

await time("xano latest paged default (schedules)", () =>
  pagedWalk(`${media}/media_plan_versions_latest`, {}, "latest-default")
)

await time("xano trimmed paged (list)", () =>
  pagedWalk(`${media}/media_plan_versions_trimmed`, {}, "trimmed")
)

await time("xano master paged", () =>
  pagedWalk(`${media}/media_plan_master`, {}, "master")
)

await time("xano master unpaged", async () => {
  const res = await axios.get(`${media}/media_plan_master`, {
    headers: authHeaders(),
    timeout: 180000,
  })
  return { bytes: JSON.stringify(res.data).length }
})

await time("xano jayco001 master", async () => {
  const res = await axios.get(`${media}/media_plan_master`, {
    params: { mba_number: "jayco001" },
    headers: authHeaders(),
    timeout: 180000,
  })
  return { bytes: JSON.stringify(res.data).length }
})

await time("xano jayco001 trimmed history", async () => {
  const res = await axios.get(`${media}/media_plan_versions_trimmed`, {
    params: { mba_number: "jayco001", page: 1, per_page: 100 },
    headers: authHeaders(),
    timeout: 180000,
  })
  return { bytes: JSON.stringify(res.data).length }
})

await time("xano jayco001 version row v7", async () => {
  const res = await axios.get(`${media}/media_plan_versions`, {
    params: { mba_number: "jayco001", version_number: 7, page: 1, per_page: 50 },
    headers: authHeaders(),
    timeout: 180000,
  })
  return { bytes: JSON.stringify(res.data).length }
})

await time("xano get_publishers", async () => {
  const res = await axios.get(`${pub}/get_publishers`, {
    headers: authHeaders(),
    timeout: 180000,
  })
  const data = res.data
  return {
    bytes: JSON.stringify(data).length,
    extra: Array.isArray(data) ? `n=${data.length}` : "",
  }
})

if (cookie) {
  const headers = { Cookie: cookie }
  for (const path of [
    "/api/media_plans",
    "/api/mediaplans",
    "/api/mediaplans/mba/jayco001?skipLineItems=true&billingScheduleFull=1&version=7",
    "/api/publishers",
    "/api/dashboard/global-monthly-publisher-spend",
    "/api/dashboard/global-monthly-client-spend",
  ]) {
    await time(`next ${path}`, async () => {
      const res = await axios.get(`${nextBase}${path}`, {
        headers,
        timeout: 180000,
        validateStatus: () => true,
      })
      return {
        bytes: JSON.stringify(res.data).length,
        extra: `status=${res.status}`,
      }
    })
  }
} else {
  console.log(
    JSON.stringify({
      note: "Set NEXT_COOKIE to also time authenticated Next API routes",
    })
  )
}
