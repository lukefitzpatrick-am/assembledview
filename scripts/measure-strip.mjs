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

const media = (process.env.XANO_MEDIA_PLANS_BASE_URL || "").replace(/\/$/, "")
const h = process.env.XANO_API_KEY
  ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` }
  : {}

const t0 = Date.now()
const all = []
for (let page = 1; page <= 50; page++) {
  const res = await axios.get(`${media}/media_plan_versions_latest`, {
    params: { page, per_page: 100, include_schedules: false },
    headers: h,
    timeout: 180000,
  })
  const chunk = Array.isArray(res.data) ? res.data : res.data.items || []
  all.push(...chunk)
  const next = res.data?.nextPage
  if (next == null || next === "" || Number(next) <= 0) break
}
const before = JSON.stringify(all).length
for (const row of all) {
  delete row.deliverySchedule
  delete row.billingSchedule
  delete row.delivery_schedule
  delete row.billing_schedule
}
const after = JSON.stringify(all).length
console.log(
  JSON.stringify({
    ms: Date.now() - t0,
    n: all.length,
    beforeBytes: before,
    afterStripBytes: after,
    saved: before - after,
  })
)
