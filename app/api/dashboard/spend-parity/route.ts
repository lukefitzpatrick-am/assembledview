import { NextResponse } from "next/server"
import {
  getGlobalMonthlyPublisherSpend,
  getGlobalMonthlyPublisherSpendLegacy,
  getGlobalMonthlyClientSpend,
  getGlobalMonthlyClientSpendLegacy,
} from "@/lib/api/dashboard/global"

export const dynamic = "force-dynamic"

type SpendCell = { key: string; amount: number }
type MonthBucket = { month: string; data: SpendCell[] }

type Diff = {
  month: string
  key: string
  legacy: number | null
  next: number | null
  delta: number | null
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

function toKeyMap(data: SpendCell[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of data) {
    map.set(item.key, roundCents(item.amount))
  }
  return map
}

function compareMonthBuckets(
  legacyMonths: MonthBucket[],
  nextMonths: MonthBucket[]
): { match: boolean; diffs: Diff[] } {
  const diffs: Diff[] = []
  const months = new Set([
    ...legacyMonths.map((m) => m.month),
    ...nextMonths.map((m) => m.month),
  ])

  for (const month of months) {
    const legacyMap = toKeyMap(
      legacyMonths.find((m) => m.month === month)?.data ?? []
    )
    const nextMap = toKeyMap(
      nextMonths.find((m) => m.month === month)?.data ?? []
    )
    const keys = new Set([...legacyMap.keys(), ...nextMap.keys()])

    for (const key of keys) {
      const hasLegacy = legacyMap.has(key)
      const hasNext = nextMap.has(key)
      const legacy = hasLegacy ? legacyMap.get(key)! : null
      const next = hasNext ? nextMap.get(key)! : null

      if (!hasLegacy || !hasNext) {
        diffs.push({
          month,
          key,
          legacy,
          next,
          delta: legacy !== null && next !== null ? roundCents(next - legacy) : null,
        })
        continue
      }

      const delta = roundCents(next! - legacy!)
      if (Math.abs(delta) >= 0.005) {
        diffs.push({ month, key, legacy, next, delta })
      }
    }
  }

  return { match: diffs.length === 0, diffs }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available" }, { status: 404 })
  }

  try {
    const [legacyPublisher, nextPublisher, legacyClientResult, nextClientResult] =
      await Promise.all([
        getGlobalMonthlyPublisherSpendLegacy(),
        getGlobalMonthlyPublisherSpend(),
        getGlobalMonthlyClientSpendLegacy(),
        getGlobalMonthlyClientSpend(),
      ])

    const publisher = compareMonthBuckets(
      legacyPublisher.map((m) => ({
        month: m.month,
        data: m.data.map((d) => ({ key: d.publisher, amount: d.amount })),
      })),
      nextPublisher.map((m) => ({
        month: m.month,
        data: m.data.map((d) => ({ key: d.publisher, amount: d.amount })),
      }))
    )

    const client = compareMonthBuckets(
      legacyClientResult.data.map((m) => ({
        month: m.month,
        data: m.data.map((d) => ({ key: d.client, amount: d.amount })),
      })),
      nextClientResult.data.map((m) => ({
        month: m.month,
        data: m.data.map((d) => ({ key: d.client, amount: d.amount })),
      }))
    )

    return NextResponse.json({ publisher, client })
  } catch (error: unknown) {
    const err = error as {
      response?: { status?: number; data?: unknown }
      message?: string
      config?: { url?: string }
    }
    const status = err?.response?.status
    const url = err?.config?.url

    if (status === 404) {
      return NextResponse.json(
        {
          error: "Xano endpoint 404",
          url,
          detail: err?.response?.data ?? err?.message,
        },
        { status: 502 }
      )
    }

    console.error("spend-parity failed:", error)
    return NextResponse.json(
      {
        error: "spend-parity failed",
        url,
        status,
        detail: err?.response?.data ?? err?.message ?? String(error),
      },
      { status: 500 }
    )
  }
}
