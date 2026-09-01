/**
 * CB-1 report-only: xero_contacts → clients coverage under normalizeContactKey.
 * PRINT ONLY. No writes.
 *
 * Usage:
 *   node --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/verify/cb1-contact-coverage.ts
 */
import { sql } from "drizzle-orm"

import { closeDb, getDb } from "@/db"
import { normalizeContactKey } from "@/lib/xero/normalizeContact"
import { rowsOf } from "@/lib/xero/dbRows"
import { loadEnvLocal } from "../migration/_shared"

loadEnvLocal()

const FY26_START = "2025-07-01"

/** Probe only — not the seed rule. Punctuation + extra corporate suffixes. */
function looserContactKey(name: string): string {
  let key = name.toLowerCase().trim()
  key = key.replace(/[.,'/&()]+/g, " ")
  key = key.replace(/\s+/g, " ").trim()
  const suffixes = [
    " pty ltd",
    " pty. ltd.",
    " pty limited",
    " proprietary limited",
    " limited",
    " ltd",
    " australia",
    " pty",
    " inc",
    " incorporated",
    " co",
    " company",
  ]
  for (const suffix of suffixes) {
    if (key.endsWith(suffix)) key = key.slice(0, -suffix.length).trim()
  }
  return key
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) row[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost)
      prev = cur
    }
  }
  return row[b.length]!
}

type Bucket = "unique" | "zero" | "ambiguous"

function classify(
  contactKey: string,
  clientKeys: Map<string, number[]>,
): { bucket: Bucket; clientIds: number[] } {
  if (!contactKey) return { bucket: "zero", clientIds: [] }
  const ids = [...new Set(clientKeys.get(contactKey) ?? [])]
  if (ids.length === 1) return { bucket: "unique", clientIds: ids }
  if (ids.length >= 2) return { bucket: "ambiguous", clientIds: ids }
  return { bucket: "zero", clientIds: [] }
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

async function main() {
  const db = getDb()

  const contacts = rowsOf<{
    xero_contact_id: string
    name: string | null
  }>(
    await db.execute(sql`
      SELECT xero_contact_id, name FROM xero_contacts
    `),
  )

  const clients = rowsOf<{
    id: number
    mp_client_name: string | null
  }>(
    await db.execute(sql`
      SELECT id, mp_client_name FROM clients
    `),
  )

  const ar = rowsOf<{
    xero_invoice_id: string
    xero_contact_id: string | null
    amount_due: string | number | null
  }>(
    await db.execute(sql`
      SELECT xero_invoice_id, xero_contact_id, amount_due
      FROM xero_ar_invoices
      WHERE issue_date >= ${FY26_START}
    `),
  )

  const linkCount = Number(
    rowsOf<{ n: number }>(
      await db.execute(sql`SELECT count(*)::int AS n FROM xero_contact_links`),
    )[0]?.n ?? 0,
  )

  const clientKeys = new Map<string, number[]>()
  const looserClientKeys = new Map<string, number[]>()
  const clientNameById = new Map<number, string>()
  for (const c of clients) {
    const id = Number(c.id)
    const name = c.mp_client_name ?? ""
    clientNameById.set(id, name)
    const k = normalizeContactKey(name)
    if (k) {
      const list = clientKeys.get(k) ?? []
      list.push(id)
      clientKeys.set(k, list)
    }
    const lk = looserContactKey(name)
    if (lk) {
      const list = looserClientKeys.get(lk) ?? []
      list.push(id)
      looserClientKeys.set(lk, list)
    }
  }

  const contactBuckets: Record<Bucket, number> = {
    unique: 0,
    zero: 0,
    ambiguous: 0,
  }
  const looserBuckets: Record<Bucket, number> = {
    unique: 0,
    zero: 0,
    ambiguous: 0,
  }
  const contactClass = new Map<
    string,
    { bucket: Bucket; name: string; key: string }
  >()
  const unmatched: Array<{ name: string; key: string }> = []

  for (const c of contacts) {
    const name = c.name ?? ""
    const key = normalizeContactKey(name)
    const { bucket } = classify(key, clientKeys)
    contactBuckets[bucket] += 1
    contactClass.set(c.xero_contact_id, { bucket, name, key })
    if (bucket === "zero") unmatched.push({ name, key })

    const looser = classify(looserContactKey(name), looserClientKeys)
    looserBuckets[looser.bucket] += 1
  }

  const arWeight: Record<
    Bucket,
    { invoices: number; outstandingInvoices: number; amountDue: number }
  > = {
    unique: { invoices: 0, outstandingInvoices: 0, amountDue: 0 },
    zero: { invoices: 0, outstandingInvoices: 0, amountDue: 0 },
    ambiguous: { invoices: 0, outstandingInvoices: 0, amountDue: 0 },
  }
  let fy26Total = 0
  let fy26Outstanding = 0
  let missingContact = 0

  for (const inv of ar) {
    fy26Total += 1
    const due = Number(inv.amount_due ?? 0) || 0
    const outstanding = due > 0.005
    if (outstanding) fy26Outstanding += 1
    const cid = inv.xero_contact_id
    if (!cid || !contactClass.has(cid)) {
      missingContact += 1
      continue
    }
    const bucket = contactClass.get(cid)!.bucket
    arWeight[bucket].invoices += 1
    if (outstanding) {
      arWeight[bucket].outstandingInvoices += 1
      arWeight[bucket].amountDue += due
    }
  }

  const clientNorms = [...clientKeys.keys()].map((key) => {
    const id = clientKeys.get(key)![0]!
    return { key, name: clientNameById.get(id) ?? key }
  })

  const sample = unmatched
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20)
    .map((u) => {
      let best = { name: "(none)", key: "", dist: Infinity }
      for (const cl of clientNorms) {
        const dist = levenshtein(u.key, cl.key)
        if (dist < best.dist) best = { name: cl.name, key: cl.key, dist }
      }
      return {
        contact: u.name || "(blank)",
        contact_key: u.key || "(empty)",
        closest_client: best.name,
        closest_key: best.key,
        distance: best.dist === Infinity ? null : best.dist,
      }
    })

  console.log("=== CB-1 contact coverage (PRINT ONLY) ===")
  console.log(`rule: lib/xero/normalizeContact.ts normalizeContactKey`)
  console.log(`  lower+trim; strip suffixes via split/join:`)
  console.log(`  " pty ltd" | " limited" | " ltd" | " australia"`)
  console.log(`  no punctuation strip, no extra suffixes`)
  console.log(`xero_contact_links rows: ${linkCount}`)
  console.log(`xero_contacts total: ${contacts.length}`)
  console.log(
    `  unique (exactly one client): ${contactBuckets.unique}`,
  )
  console.log(`  zero clients:            ${contactBuckets.zero}`)
  console.log(`  ambiguous (2+ clients):  ${contactBuckets.ambiguous}`)
  console.log(`clients total: ${clients.length}`)
  console.log("")
  console.log(`FY26 AR invoices (issue_date >= ${FY26_START}): ${fy26Total}`)
  console.log(`  missing xero_contact_id / unknown contact: ${missingContact}`)
  console.log("  weighted by invoice count:")
  console.log(
    `    unique=${arWeight.unique.invoices} zero=${arWeight.zero.invoices} ambiguous=${arWeight.ambiguous.invoices}`,
  )
  console.log(
    `  outstanding (amount_due > 0): ${fy26Outstanding} invoices`,
  )
  console.log("  weighted by outstanding invoice count:")
  console.log(
    `    unique=${arWeight.unique.outstandingInvoices} zero=${arWeight.zero.outstandingInvoices} ambiguous=${arWeight.ambiguous.outstandingInvoices}`,
  )
  console.log("  weighted by outstanding amount_due:")
  console.log(
    `    unique=$${fmtMoney(arWeight.unique.amountDue)} zero=$${fmtMoney(arWeight.zero.amountDue)} ambiguous=$${fmtMoney(arWeight.ambiguous.amountDue)}`,
  )
  console.log("")
  console.log("=== looser probe (NOT the seed rule) ===")
  console.log(
    `  unique=${looserBuckets.unique} zero=${looserBuckets.zero} ambiguous=${looserBuckets.ambiguous}`,
  )
  console.log(
    `  unique delta vs current rule: ${looserBuckets.unique - contactBuckets.unique} (ambiguous delta ${looserBuckets.ambiguous - contactBuckets.ambiguous})`,
  )
  console.log("")
  console.log("=== sample of 20 unmatched contacts (closest client by Levenshtein on normalised key) ===")
  console.log(JSON.stringify(sample, null, 2))

  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  try {
    await closeDb()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
