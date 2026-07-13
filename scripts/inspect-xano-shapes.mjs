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

for (const path of [
  "media_plan_versions_trimmed",
  "media_plan_versions",
  "media_plan_versions_latest",
]) {
  const res = await axios.get(`${media}/${path}`, {
    params: { page: 1, per_page: 5, mba_number: "jayco001" },
    headers: h,
    timeout: 60000,
    validateStatus: () => true,
  })
  const s = JSON.stringify(res.data)
  console.log(
    JSON.stringify({
      path,
      status: res.status,
      len: s.length,
      preview: s.slice(0, 400),
    })
  )
}

const latest = await axios.get(`${media}/media_plan_versions_latest`, {
  params: { page: 1, per_page: 1, include_schedules: false },
  headers: h,
  timeout: 60000,
})
const item = Array.isArray(latest.data)
  ? latest.data[0]
  : (latest.data.items || [])[0]
if (item) {
  const entries = Object.keys(item).map((k) => [
    k,
    JSON.stringify(item[k] ?? null).length,
  ])
  entries.sort((a, b) => b[1] - a[1])
  console.log(
    JSON.stringify({
      sampleKeys: Object.keys(item).length,
      topFieldBytes: Object.fromEntries(entries.slice(0, 20)),
      hasDelivery: item.deliverySchedule != null || item.delivery_schedule != null,
      hasBilling: item.billingSchedule != null || item.billing_schedule != null,
    })
  )
}
