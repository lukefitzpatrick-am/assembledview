import assert from "node:assert/strict"
import test from "node:test"

import {
  fetchRevenueForecastTargetLinesFromXano,
  isFinanceForecastLineKey,
  isFinanceForecastMonthKey,
  isTargetStorageConfigured,
  normalizeTargetLine,
  targetLineNaturalKey,
  upsertRevenueForecastTargetLine,
  upsertRevenueForecastTargetLinesBatch,
} from "../xanoTargetLines.js"

const FY = 2025

test("isFinanceForecastLineKey / monthKey reuse booked unions", () => {
  assert.equal(isFinanceForecastLineKey("retainer"), true)
  assert.equal(isFinanceForecastLineKey("not_a_real_line"), false)
  assert.equal(isFinanceForecastMonthKey("july"), true)
  assert.equal(isFinanceForecastMonthKey("jul"), false)
})

test("targetLineNaturalKey matches upsert grain", () => {
  assert.equal(
    targetLineNaturalKey({
      client_id: "c1",
      financial_year_start_year: FY,
      line_key: "retainer",
      month_key: "july",
    }),
    "c1::2025::retainer::july"
  )
})

test("normalizeTargetLine accepts financial_year alias", () => {
  const line = normalizeTargetLine({
    id: "42",
    client_id: "9",
    financial_year: FY,
    line_key: "commission",
    month_key: "march",
    amount: "1200.5",
  })
  assert.ok(line)
  assert.equal(line!.financial_year_start_year, FY)
  assert.equal(line!.amount, 1200.5)
  assert.equal(line!.line_key, "commission")
  assert.equal(line!.month_key, "march")
})

test("fetchRevenueForecastTargetLinesFromXano lists via mocked fetch", async () => {
  const prevBase = process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL
  const prevClients = process.env.XANO_CLIENTS_BASE_URL
  process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL = "https://xano.test/api:targets"
  delete process.env.XANO_CLIENTS_BASE_URL

  assert.equal(isTargetStorageConfigured(), true)

  const originalFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    assert.match(url, /revenue_forecast_lines/)
    assert.match(url, /financial_year_start_year=2025/)
    assert.match(url, /client_id=acme/)
    return new Response(
      JSON.stringify([
        {
          id: "1",
          client_id: "acme",
          financial_year_start_year: FY,
          line_key: "retainer",
          month_key: "july",
          amount: 100,
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }) as typeof fetch

  try {
    const lines = await fetchRevenueForecastTargetLinesFromXano({
      financial_year_start_year: FY,
      client_id: "acme",
    })
    assert.equal(lines.length, 1)
    assert.equal(lines[0].amount, 100)
    assert.equal(calls.length, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (prevBase === undefined) delete process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL
    else process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL = prevBase
    if (prevClients === undefined) delete process.env.XANO_CLIENTS_BASE_URL
    else process.env.XANO_CLIENTS_BASE_URL = prevClients
  }
})

test("upsertRevenueForecastTargetLine POSTs when no existing row", async () => {
  const prevBase = process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL
  process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL = "https://xano.test/api:targets"

  const originalFetch = globalThis.fetch
  const methods: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    methods.push(method)

    if (method === "GET") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    assert.equal(method, "POST")
    assert.match(url, /revenue_forecast_lines$/)
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    assert.equal(body.client_id, "c1")
    assert.equal(body.financial_year_start_year, FY)
    assert.equal(body.line_key, "retainer")
    assert.equal(body.month_key, "august")
    assert.equal(body.amount, 250)

    return new Response(
      JSON.stringify({
        id: "new-1",
        ...body,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }) as typeof fetch

  try {
    const { line, previousAmount } = await upsertRevenueForecastTargetLine({
      cell: {
        client_id: "c1",
        financial_year_start_year: FY,
        line_key: "retainer",
        month_key: "august",
        amount: 250,
      },
      updatedBy: "admin@example.com",
    })
    assert.equal(previousAmount, null)
    assert.equal(line.id, "new-1")
    assert.equal(line.amount, 250)
    assert.deepEqual(methods, ["GET", "POST"])
  } finally {
    globalThis.fetch = originalFetch
    if (prevBase === undefined) delete process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL
    else process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL = prevBase
  }
})

test("upsertRevenueForecastTargetLine PATCHes existing natural key", async () => {
  const prevBase = process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL
  process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL = "https://xano.test/api:targets"

  const originalFetch = globalThis.fetch
  const methods: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    methods.push(method)

    if (method === "GET") {
      return new Response(
        JSON.stringify([
          {
            id: "row-9",
            client_id: "c1",
            financial_year_start_year: FY,
            line_key: "commission",
            month_key: "january",
            amount: 10,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    assert.equal(method, "PATCH")
    assert.match(url, /revenue_forecast_lines\/row-9$/)
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    assert.equal(body.amount, 99)

    return new Response(
      JSON.stringify({
        id: "row-9",
        client_id: "c1",
        financial_year_start_year: FY,
        line_key: "commission",
        month_key: "january",
        amount: 99,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }) as typeof fetch

  try {
    const { line, previousAmount } = await upsertRevenueForecastTargetLine({
      cell: {
        client_id: "c1",
        financial_year_start_year: FY,
        line_key: "commission",
        month_key: "january",
        amount: 99,
      },
    })
    assert.equal(previousAmount, 10)
    assert.equal(line.amount, 99)
    assert.deepEqual(methods, ["GET", "PATCH"])
  } finally {
    globalThis.fetch = originalFetch
    if (prevBase === undefined) delete process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL
    else process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL = prevBase
  }
})

test("upsertRevenueForecastTargetLinesBatch upserts many cells with one list per client/fy", async () => {
  const prevBase = process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL
  process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL = "https://xano.test/api:targets"

  const originalFetch = globalThis.fetch
  let getCount = 0
  let writeCount = 0
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase()
    if (method === "GET") {
      getCount++
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    writeCount++
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        id: `id-${writeCount}`,
        ...body,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }) as typeof fetch

  try {
    const { lines, previousByKey } = await upsertRevenueForecastTargetLinesBatch({
      cells: [
        {
          client_id: "c1",
          financial_year_start_year: FY,
          line_key: "retainer",
          month_key: "july",
          amount: 1,
        },
        {
          client_id: "c1",
          financial_year_start_year: FY,
          line_key: "retainer",
          month_key: "august",
          amount: 2,
        },
      ],
    })
    assert.equal(lines.length, 2)
    assert.equal(getCount, 1)
    assert.equal(writeCount, 2)
    assert.equal(
      previousByKey.get("c1::2025::retainer::july"),
      null
    )
  } finally {
    globalThis.fetch = originalFetch
    if (prevBase === undefined) delete process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL
    else process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL = prevBase
  }
})
