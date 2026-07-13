/**
 * Phase 4 after timings — same as baseline but also times Next cache modules.
 */
import fs from "fs"
import axios from "axios"
import { createRequire } from "module"
import { pathToFileURL } from "url"

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

function authHeaders() {
  return process.env.XANO_API_KEY
    ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` }
    : {}
}

async function time(label, fn) {
  const t0 = Date.now()
  try {
    const r = await fn()
    console.log(
      JSON.stringify({
        label,
        ms: Date.now() - t0,
        ok: true,
        bytes: r?.bytes,
        extra: r?.extra,
      })
    )
  } catch (e) {
    console.log(
      JSON.stringify({
        label,
        ms: Date.now() - t0,
        ok: false,
        err: e.response?.status || e.message,
      })
    )
  }
}

console.log(JSON.stringify({ phase: "after" }))

// Simulate MBA critical path (no version history walk)
await time("after jayco001 master+version parallel-ish", async () => {
  const t0 = Date.now()
  const [master, version] = await Promise.all([
    axios.get(`${media}/media_plan_master`, {
      params: { mba_number: "jayco001" },
      headers: authHeaders(),
      timeout: 180000,
    }),
    axios.get(`${media}/media_plan_versions`, {
      params: { mba_number: "jayco001", version_number: 7, page: 1, per_page: 50 },
      headers: authHeaders(),
      timeout: 180000,
    }),
  ])
  return {
    bytes:
      JSON.stringify(master.data).length + JSON.stringify(version.data).length,
    extra: `wall=${Date.now() - t0}`,
  }
})

await time("after get_publishers", async () => {
  const res = await axios.get(`${pub}/get_publishers`, {
    headers: authHeaders(),
    timeout: 180000,
  })
  const raw = res.data
  const light = Array.isArray(raw)
    ? raw.map((row) => {
        const out = {}
        for (const [k, v] of Object.entries(row || {})) {
          if (String(k).toLowerCase().includes("best_practice")) continue
          if (
            [
              "id",
              "publisherid",
              "publisher_id",
              "publisher_name",
              "publisherName",
              "name",
              "billingagency",
              "billing_agency",
              "billingAgency",
            ].includes(k) ||
            String(k).startsWith("pub_")
          ) {
            out[k] = v
          }
        }
        return out
      })
    : []
  return {
    bytes: JSON.stringify(light).length,
    extra: `fullBytes=${JSON.stringify(raw).length} n=${light.length}`,
  }
})

await time("after latest paged include_schedules=false", async () => {
  let page = 1
  let totalBytes = 0
  let items = 0
  for (; page <= 50; page++) {
    const res = await axios.get(`${media}/media_plan_versions_latest`, {
      params: { page, per_page: 100, include_schedules: false },
      headers: authHeaders(),
      timeout: 180000,
    })
    const raw = JSON.stringify(res.data)
    totalBytes += raw.length
    const chunk = Array.isArray(res.data)
      ? res.data
      : res.data?.items || []
    items += chunk.length
    // strip schedules client-side (what our cache does)
    for (const row of chunk) {
      delete row.deliverySchedule
      delete row.billingSchedule
      delete row.delivery_schedule
      delete row.billing_schedule
    }
    const next = res.data?.nextPage
    if (next == null || next === "" || Number(next) <= 0) break
    if (chunk.length < 100 && !Array.isArray(res.data)) break
  }
  return { bytes: totalBytes, extra: `pages=${page} items≈${items}` }
})

await time("after trimmed+master list path", async () => {
  const [trimmed, masters] = await Promise.all([
    axios.get(`${media}/media_plan_versions_trimmed`, {
      params: { page: 1, per_page: 100 },
      headers: authHeaders(),
      timeout: 180000,
    }),
    axios.get(`${media}/media_plan_master`, {
      params: { page: 1, per_page: 100 },
      headers: authHeaders(),
      timeout: 180000,
    }),
  ])
  const trimmedLen = JSON.stringify(trimmed.data).length
  // fallback latest if trimmed empty
  let extra = `trimmedBytes=${trimmedLen}`
  if (trimmedLen <= 2) {
    const latest = await axios.get(`${media}/media_plan_versions_latest`, {
      params: { page: 1, per_page: 100, include_schedules: false },
      headers: authHeaders(),
      timeout: 180000,
    })
    extra += ` fallbackLatestBytes=${JSON.stringify(latest.data).length}`
  }
  return {
    bytes: trimmedLen + JSON.stringify(masters.data).length,
    extra,
  }
})
