import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { aggregateInvestmentDisplayRows } from "@/lib/billing/prorateInvestmentDisplay"
import { channelInvestmentByMonth } from "@/lib/mediaplan/channelInvestment"
import { parseMoney, toCents } from "@/lib/money"

const TWO_MONTHS = {
  budget: 1000,
  startDate: "2026-01-01",
  endDate: "2026-02-28",
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    buyType: "cpm",
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    bursts: [TWO_MONTHS],
    ...overrides,
  }
}

function sumCents(rows: { amount: string }[]) {
  return rows.reduce((sum, row) => sum + toCents(parseMoney(row.amount) ?? 0), 0)
}

function monthCents(rows: { monthYear: string; amount: string }[]) {
  return rows.map((row) => ({
    monthYear: row.monthYear,
    cents: toCents(parseMoney(row.amount) ?? 0),
  }))
}

/** Same split as the fat containers' calculateInvestmentPerMonth. Not the new chart. */
function legacyInvestmentRows(item: ReturnType<typeof line>, feePct: number) {
  const includesFees = !!item.budgetIncludesFees
  const bursts = (item.bursts as { budget: unknown; startDate: string; endDate: string }[]).map(
    (burst) => {
      const lineMedia = parseFloat(String(burst.budget).replace(/[^0-9.]/g, "")) || 0
      const pct = feePct || 0
      const totalInvestment = includesFees
        ? lineMedia
        : lineMedia + (lineMedia / (100 - pct)) * pct
      return { amount: totalInvestment, start: burst.startDate, end: burst.endDate }
    },
  )
  return aggregateInvestmentDisplayRows(bursts)
}

test("gross-in $1,000 at 15% across two months sums to $1,000", () => {
  const rows = channelInvestmentByMonth([line({ budgetIncludesFees: true })], 15)
  assert.equal(rows.length, 2)
  assert.equal(sumCents(rows), 100_000)
})

test("net-in $1,000 at 15% across two months sums to about $1,176.47", () => {
  const rows = channelInvestmentByMonth([line({ budgetIncludesFees: false })], 15)
  assert.equal(rows.length, 2)
  assert.equal(sumCents(rows), 117_647)
})

test("bonus and package inclusions chart as zero; client-pays keeps planned media", () => {
  assert.equal(channelInvestmentByMonth([line({ buyType: "bonus" })], 15).length, 0)
  assert.equal(
    channelInvestmentByMonth([line({ buyType: "package_inclusions" })], 15).length,
    0,
  )
  const clientPays = channelInvestmentByMonth(
    [line({ clientPaysForMedia: true, budgetIncludesFees: false })],
    15,
  )
  assert.equal(sumCents(clientPays), 117_647)
})

test("the hook passes the form lines through and does not gross up again", () => {
  const hook = readFileSync(
    join(process.cwd(), "lib/mediaplan/useMediaChannelContainer.ts"),
    "utf8",
  )
  const fn = hook.slice(
    hook.indexOf("export function calculateChannelInvestmentPerMonth"),
    hook.indexOf("export function useMediaChannelContainer"),
  )
  assert.match(fn, /channelInvestmentByMonth\(items, feePct \|\| 0\)/)
  assert.doesNotMatch(fn, /100 - pct/)
})

test("legacy fat containers still use the includes-fees gross-up", () => {
  const files = [
    "BVODContainer.tsx",
    "CinemaContainer.tsx",
    "DigitalAudioContainer.tsx",
    "DigitalDisplayContainer.tsx",
    "DigitalVideoContainer.tsx",
    "InfluencersContainer.tsx",
    "IntegrationContainer.tsx",
    "MagazinesContainer.tsx",
    "NewspaperContainer.tsx",
    "OOHContainer.tsx",
    "RadioContainer.tsx",
    "SocialMediaContainer.tsx",
    "TelevisionContainer.tsx",
  ]
  for (const file of files) {
    const source = readFileSync(
      join(process.cwd(), "components/media-containers", file),
      "utf8",
    )
    assert.match(
      source,
      /const totalInvestment = includesFees\s*\?\s*lineMedia\s*:\s*lineMedia \+ \(\(lineMedia \/ \(100 - feePct\)\) \* feePct\)/,
      file,
    )
  }
})

test("a normal gross-in and net-in line matches the legacy months", () => {
  for (const includesFees of [true, false]) {
    for (const clientPays of [false, true]) {
      const item = line({ budgetIncludesFees: includesFees, clientPaysForMedia: clientPays })
      const next = channelInvestmentByMonth([item], 15)
      const legacy = legacyInvestmentRows(item, 15)
      assert.deepEqual(monthCents(next), monthCents(legacy))
    }
  }
  const formatted = line({
    budgetIncludesFees: true,
    bursts: [{ budget: "$1,000.00", startDate: "2026-01-01", endDate: "2026-02-28" }],
  })
  assert.deepEqual(
    monthCents(channelInvestmentByMonth([formatted], 15)),
    monthCents(legacyInvestmentRows(formatted, 15)),
  )
})

test("legacy months differ for bonus, package inclusions and a 100% net fee", () => {
  for (const buyType of ["bonus", "package_inclusions"]) {
    const item = line({ buyType })
    assert.equal(channelInvestmentByMonth([item], 15).length, 0)
    assert.equal(sumCents(legacyInvestmentRows(item, 15)), 117_647)
  }
  const fullFee = line({})
  assert.equal(sumCents(channelInvestmentByMonth([fullFee], 100)), 100_000)
  const legacyAmount =
    1000 + (1000 / (100 - 100)) * 100
  assert.equal(Number.isFinite(legacyAmount), false)
})
