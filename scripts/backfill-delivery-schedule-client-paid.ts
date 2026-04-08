/**
 * Backfill `clientPaysForMedia` on `media_plan_versions.deliverySchedule` JSON by aligning
 * each delivery line item with the same `lineItemId` on that version’s `billingSchedule`.
 *
 * - Batches of 100 versions per progress log; PATCHes only when a line’s flag would change.
 * - Idempotent: re-running is safe (same inputs → no further writes).
 * - Requires `XANO_API_KEY` and `XANO_MEDIA_PLANS_BASE_URL` or `XANO_MEDIAPLANS_BASE_URL` (see `.env.local`).
 *
 * Usage:
 *   npx tsx scripts/backfill-delivery-schedule-client-paid.ts
 *   npx tsx scripts/backfill-delivery-schedule-client-paid.ts --dry-run
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"

const REPO_ROOT = process.cwd()
const BATCH_LOG = 100

function loadEnvLocal(): void {
  const p = path.join(REPO_ROOT, ".env.local")
  if (!fs.existsSync(p)) return
  const text = fs.readFileSync(p, "utf8")
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val
    }
  }
}

function coalesceJson(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return null
    try {
      return JSON.parse(t) as unknown
    } catch {
      return null
    }
  }
  return raw
}

/** Month rows: top-level array, or `months`, `deliverySchedule`, or `billingSchedule` wrapper. */
function scheduleMonthArray(raw: unknown): unknown[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.months)) return o.months
    if (Array.isArray(o.deliverySchedule)) return o.deliverySchedule
    if (Array.isArray(o.billingSchedule)) return o.billingSchedule
  }
  return []
}

function collectClientPaysByLineItemIdFromMonths(months: unknown[]): Map<string, boolean> {
  const m = new Map<string, boolean>()
  for (const month of months) {
    if (!month || typeof month !== "object") continue
    const mediaTypes = (month as Record<string, unknown>).mediaTypes
    if (!Array.isArray(mediaTypes)) continue
    for (const mt of mediaTypes) {
      if (!mt || typeof mt !== "object") continue
      const lineItems = (mt as Record<string, unknown>).lineItems
      if (!Array.isArray(lineItems)) continue
      for (const li of lineItems) {
        if (!li || typeof li !== "object") continue
        const o = li as Record<string, unknown>
        const id = String(o.lineItemId ?? "").trim()
        if (!id) continue
        const pays = o.clientPaysForMedia === true || o.client_pays_for_media === true
        m.set(id, pays)
      }
    }
  }
  return m
}

function getDeliveryMonthsRef(root: unknown): unknown[] | null {
  if (!root) return null
  if (Array.isArray(root)) return root
  if (typeof root === "object" && root !== null) {
    const o = root as Record<string, unknown>
    if (Array.isArray(o.months)) return o.months
    if (Array.isArray(o.deliverySchedule)) return o.deliverySchedule
  }
  return null
}

function deliveryNeedsPatchFromBillingMap(deliveryRoot: unknown, billingMap: Map<string, boolean>): boolean {
  const months = getDeliveryMonthsRef(deliveryRoot)
  if (!months) return false

  for (const month of months) {
    if (!month || typeof month !== "object") continue
    const mediaTypes = (month as Record<string, unknown>).mediaTypes
    if (!Array.isArray(mediaTypes)) continue
    for (const mt of mediaTypes) {
      if (!mt || typeof mt !== "object") continue
      const lineItems = (mt as Record<string, unknown>).lineItems
      if (!Array.isArray(lineItems)) continue
      for (const li of lineItems) {
        if (!li || typeof li !== "object") continue
        const o = li as Record<string, unknown>
        const id = String(o.lineItemId ?? "").trim()
        if (!id) continue

        const desired = billingMap.get(id) === true
        const current = o.clientPaysForMedia === true || o.client_pays_for_media === true
        if (current !== desired) return true
      }
    }
  }
  return false
}

/**
 * Sets each delivery line’s `clientPaysForMedia` from `billingMap` (missing id → false).
 * Mutates `deliveryRoot` in place. Returns whether anything changed.
 */
function mutateDeliveryFromBillingMap(deliveryRoot: unknown, billingMap: Map<string, boolean>): boolean {
  const months = getDeliveryMonthsRef(deliveryRoot)
  if (!months) return false

  let changed = false
  for (const month of months) {
    if (!month || typeof month !== "object") continue
    const mediaTypes = (month as Record<string, unknown>).mediaTypes
    if (!Array.isArray(mediaTypes)) continue
    for (const mt of mediaTypes) {
      if (!mt || typeof mt !== "object") continue
      const lineItems = (mt as Record<string, unknown>).lineItems
      if (!Array.isArray(lineItems)) continue
      for (const li of lineItems) {
        if (!li || typeof li !== "object") continue
        const o = li as Record<string, unknown>
        const id = String(o.lineItemId ?? "").trim()
        if (!id) continue

        const desired = billingMap.get(id) === true
        const current = o.clientPaysForMedia === true || o.client_pays_for_media === true

        if (current === desired) continue

        changed = true
        if (desired) {
          o.clientPaysForMedia = true
        } else {
          delete o.clientPaysForMedia
          delete o.client_pays_for_media
        }
      }
    }
  }
  return changed
}

async function main(): Promise<void> {
  loadEnvLocal()
  const dryRun = process.argv.includes("--dry-run")
  const apiKey = process.env.XANO_API_KEY
  if (!apiKey) {
    console.error("[backfill] Missing XANO_API_KEY")
    process.exit(1)
  }

  const listUrl = xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  console.info(`[backfill] Fetching all media_plan_versions from ${listUrl.split("?")[0]} …`)

  const versions = await fetchAllXanoPages(listUrl, {}, "media_plan_versions", 100, 500)
  console.info(`[backfill] Loaded ${versions.length} version row(s).`)

  let patched = 0
  let skippedNoDelivery = 0
  let skippedNoChange = 0
  let errors = 0

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  }

  for (let i = 0; i < versions.length; i++) {
    const v = versions[i] as Record<string, unknown>
    const id = v.id ?? v.ID

    if (id !== null && id !== undefined) {
      const deliveryRaw = coalesceJson(v.deliverySchedule ?? v.delivery_schedule)
      if (!deliveryRaw) {
        skippedNoDelivery++
      } else {
        const billingRaw = coalesceJson(v.billingSchedule ?? v.billing_schedule)
        const billingMonths = scheduleMonthArray(billingRaw)
        const billingMap = collectClientPaysByLineItemIdFromMonths(billingMonths)

        if (!deliveryNeedsPatchFromBillingMap(deliveryRaw, billingMap)) {
          skippedNoChange++
        } else {
          const deliveryClone = JSON.parse(JSON.stringify(deliveryRaw)) as unknown
          mutateDeliveryFromBillingMap(deliveryClone, billingMap)

          if (dryRun) {
            console.info(`[backfill] --dry-run would PATCH id=${id}`)
            patched++
          } else {
            const base = listUrl.split("?")[0]!.replace(/\/?$/, "")
            const patchUrl = `${base}/${encodeURIComponent(String(id))}`
            try {
              await axios.patch(
                patchUrl,
                {
                  deliverySchedule: deliveryClone,
                  delivery_schedule: deliveryClone,
                },
                { headers, timeout: 60000 }
              )
              patched++
            } catch (e: unknown) {
              errors++
              const msg = axios.isAxiosError(e) ? e.message : String(e)
              console.warn(`[backfill] PATCH failed id=${id}: ${msg}`)
            }
          }
        }
      }
    }

    if ((i + 1) % BATCH_LOG === 0 || i === versions.length - 1) {
      console.info(
        `[backfill] progress ${i + 1}/${versions.length} | patched=${patched} noDelivery=${skippedNoDelivery} unchanged=${skippedNoChange} errors=${errors}`
      )
    }
  }

  console.info("[backfill] done.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
