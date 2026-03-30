import assert from "node:assert/strict"
import test from "node:test"

import { buildFinanceForecastDataset } from "../../lib/finance/forecast/buildFinanceForecastDataset.js"
import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_LINE_KEYS,
} from "../../lib/types/financeForecast.js"
import { FORECAST_REVENUE_BODY_LINE_ORDER } from "../../lib/finance/forecast/mapping/definitions.js"
import { realisticMediaPlanVersionFy2025, fixturePublisherAssembledMedia } from "./fixtures/realisticMediaPlanVersion.js"
import type { FinanceForecastMediaPlanVersionInput } from "../../lib/types/financeForecast.js"

const FY_START = 2025

function assembledMediaBillingLine(dataset: ReturnType<typeof buildFinanceForecastDataset>) {
  const block = dataset.client_blocks[0]
  assert.ok(block, "expected a client block")
  const billing = block.groups.find((g) => g.group_key === "billing_based_information")
  const line = billing?.lines.find((l) => l.line_key === FINANCE_FORECAST_LINE_KEYS.assembledMediaBillingForPublisher)
  assert.ok(line, "expected assembled media billing line")
  return line
}

function revenueGroupLines(dataset: ReturnType<typeof buildFinanceForecastDataset>) {
  const block = dataset.client_blocks[0]
  assert.ok(block)
  const rev = block.groups.find((g) => g.group_key === "revenue_client_publisher_fees_commission")
  assert.ok(rev)
  return rev.lines
}

function totalRevenueLine(dataset: ReturnType<typeof buildFinanceForecastDataset>) {
  const lines = revenueGroupLines(dataset)
  const line = lines.find((l) => l.line_key === FINANCE_FORECAST_LINE_KEYS.totalRevenue)
  assert.ok(line, "expected total revenue line")
  return line
}

function baseApprovedVersion(overrides?: Partial<FinanceForecastMediaPlanVersionInput>): FinanceForecastMediaPlanVersionInput {
  return {
    id: "v-base",
    mba_number: "MBA-T-1",
    version_number: 1,
    mp_client_name: "Test Client Pty Ltd",
    campaign_name: "Test Campaign",
    campaign_status: "approved",
    campaign_start_date: "2025-07-01",
    campaign_end_date: "2026-05-30",
    billingSchedule: [
      {
        monthYear: "2025-07",
        mediaTypes: [
          {
            mediaType: "Television",
            lineItems: [
              {
                header1: "Seven Network",
                amount: 10_000,
                clientPaysForMedia: false,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

test("fiscal month order is July → June (twelve keys)", () => {
  assert.deepEqual(FINANCE_FORECAST_FISCAL_MONTH_ORDER.slice(0, 2), ["july", "august"])
  assert.equal(FINANCE_FORECAST_FISCAL_MONTH_ORDER[FINANCE_FORECAST_FISCAL_MONTH_ORDER.length - 1], "june")
})

test("July 2025 maps to the first fiscal slot for FY starting 2025", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [baseApprovedVersion()],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const line = assembledMediaBillingLine(ds)
  assert.equal(line.monthly.july, 10_000)
  assert.equal(line.monthly.august, 0)
  assert.equal(line.monthly.january, 0)
})

test("January fiscal month uses calendar year FY+1", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        billingSchedule: [
          {
            monthYear: "2026-01",
            mediaTypes: [
              {
                mediaType: "Television",
                lineItems: [
                  {
                    header1: "Seven Network",
                    amount: 3_000,
                    clientPaysForMedia: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const line = assembledMediaBillingLine(ds)
  assert.equal(line.monthly.january, 3_000)
  assert.equal(line.monthly.july, 0)
})

test("confirmed scenario excludes non-terminal statuses (e.g. draft, probable)", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const draft = baseApprovedVersion({ id: "d1", campaign_status: "draft" })
  const probable = baseApprovedVersion({ id: "p1", mba_number: "MBA-P", campaign_status: "probable" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [draft, probable],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  assert.equal(ds.client_blocks.length, 0)
})

test("confirmed scenario includes booked, approved, and completed (and normalises case)", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  for (const status of ["BOOKED", "approved", "Completed"] as const) {
    const ds = buildFinanceForecastDataset({
      media_plan_versions: [
        baseApprovedVersion({ id: status, mba_number: `MBA-${status}`, campaign_status: status }),
      ],
      clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
      publishers: [pub],
      financial_year_start_year: FY_START,
      scenario: "confirmed",
    })
    assert.ok(ds.client_blocks.length >= 1, `status ${status} should yield a client block`)
  }
})

test("confirmed_plus_probable keeps probable and draft while still excluding cancelled", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const draft = baseApprovedVersion({ id: "dr", mba_number: "MBA-DR", campaign_status: "draft" })
  const cancelled = baseApprovedVersion({ id: "cx", mba_number: "MBA-CX", campaign_status: "cancelled" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [draft, cancelled],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed_plus_probable",
  })
  assert.equal(ds.client_blocks.length, 1)
  const am = assembledMediaBillingLine(ds)
  assert.equal(am.mba_number, "MBA-DR")
})

test("billing schedule wins over delivery when both have media in the same month", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const delivery = [
    {
      monthYear: "2025-07",
      mediaTypes: [
        {
          mediaType: "Television",
          lineItems: [
            {
              header1: "Seven Network",
              amount: 80_000,
              clientPaysForMedia: false,
            },
          ],
        },
      ],
    },
  ]
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        billingSchedule: [
          {
            monthYear: "2025-07",
            mediaTypes: [
              {
                mediaType: "Television",
                lineItems: [
                  {
                    header1: "Seven Network",
                    amount: 12_000,
                    clientPaysForMedia: false,
                  },
                ],
              },
            ],
          },
        ],
        deliverySchedule: delivery,
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const line = assembledMediaBillingLine(ds)
  assert.equal(line.monthly.july, 12_000)
})

test("falls back to delivery line items when billing has no publisher rows but month media is positive", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        billingSchedule: [
          {
            monthYear: "2025-07",
            mediaTotal: 25_000,
            mediaTypes: [],
          },
        ],
        deliverySchedule: [
          {
            monthYear: "2025-07",
            mediaTypes: [
              {
                mediaType: "Television",
                lineItems: [
                  {
                    header1: "Seven Network",
                    amount: 7_500,
                    clientPaysForMedia: false,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const line = assembledMediaBillingLine(ds)
  assert.equal(line.monthly.july, 7_500)
})

test("service fees fall back to delivery when billing has no fee columns", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        billingSchedule: [
          {
            monthYear: "2025-07",
            mediaTypes: [
              {
                mediaType: "Television",
                lineItems: [
                  {
                    header1: "Seven Network",
                    amount: 1_000,
                    clientPaysForMedia: false,
                  },
                ],
              },
            ],
          },
        ],
        deliverySchedule: [
          {
            monthYear: "2025-07",
            feeTotal: 400,
            assembledFee: 400,
            adservingTechFees: 100,
            production: 0,
          },
        ],
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const lines = revenueGroupLines(ds)
  const service = lines.find((l) => l.line_key === FINANCE_FORECAST_LINE_KEYS.serviceFeeDigital)
  assert.ok(service)
  assert.equal(service.monthly.july, 500)
})

test("empty schedules yield zero billing but keep an approved in-scope campaign row", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        billingSchedule: [],
        deliverySchedule: [],
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const line = assembledMediaBillingLine(ds)
  assert.equal(line.fy_total, 0)
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
    assert.equal(line.monthly[k], 0)
  }
})

test("missing publisher still allocates media using default billing-agency rule (assembled)", () => {
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [baseApprovedVersion()],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const line = assembledMediaBillingLine(ds)
  assert.equal(line.monthly.july, 10_000)
})

test("missing clients falls back to slug-style client_id from display name", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [baseApprovedVersion()],
    clients: [],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  assert.ok(ds.client_blocks[0]?.client_id)
  assert.match(String(ds.client_blocks[0]?.client_id), /test client/)
})

test("selects latest version_number per MBA", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        id: "old",
        version_number: 1,
        billingSchedule: [
          {
            monthYear: "2025-07",
            mediaTypes: [
              {
                mediaType: "Television",
                lineItems: [{ header1: "Seven Network", amount: 100, clientPaysForMedia: false }],
              },
            ],
          },
        ],
      }),
      baseApprovedVersion({
        id: "new",
        version_number: 4,
        billingSchedule: [
          {
            monthYear: "2025-07",
            mediaTypes: [
              {
                mediaType: "Television",
                lineItems: [{ header1: "Seven Network", amount: 9_000, clientPaysForMedia: false }],
              },
            ],
          },
        ],
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const line = assembledMediaBillingLine(ds)
  assert.equal(line.monthly.july, 9_000)
  assert.equal(String(line.media_plan_version_id), "new")
})

test("burst fallback supplies media when schedules are empty but extra.bursts overlaps the month", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        billingSchedule: [],
        deliverySchedule: [],
        extra: {
          bursts: [{ startDate: "2025-10-05", endDate: "2025-10-20", budget: 3_000 }],
        },
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const line = assembledMediaBillingLine(ds)
  assert.ok(line.monthly.october > 0, "expected prorated burst in October")
})

test("total revenue matches month-wise sum of revenue body lines", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network", television_comms: 10 })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [baseApprovedVersion()],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  const lines = revenueGroupLines(ds)
  const total = totalRevenueLine(ds)
  for (const mk of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
    let sum = 0
    for (const lk of FORECAST_REVENUE_BODY_LINE_ORDER) {
      const row = lines.find((l) => l.line_key === lk)
      if (row) sum += row.monthly[mk] ?? 0
    }
    assert.equal(
      total.monthly[mk],
      sum,
      `total revenue mismatch in ${mk}`
    )
  }
})

test("realistic media_plan_versions fixture builds without error and places July TV spend", () => {
  const pub = fixturePublisherAssembledMedia()
  const version = realisticMediaPlanVersionFy2025()
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [version],
    clients: [{ id: "client-acme", mp_client_name: "Acme Retail AU" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  assert.equal(ds.client_blocks.length, 1)
  const am = assembledMediaBillingLine(ds)
  assert.equal(am.monthly.july, 50_000)
  assert.ok(am.monthly.august >= 0)
})

test("respects mp_campaignstatus when campaign_status is absent", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        campaign_status: undefined,
        mp_campaignstatus: "booked",
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  assert.equal(ds.client_blocks.length, 1)
})

test("campaign fully outside the financial year with no schedule in FY is excluded", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        campaign_start_date: "2023-01-01",
        campaign_end_date: "2023-06-30",
        billingSchedule: [],
        deliverySchedule: [],
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  assert.equal(ds.client_blocks.length, 0)
})

test("cancelled campaigns are excluded for confirmed and for confirmed_plus_probable", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  for (const scenario of ["confirmed", "confirmed_plus_probable"] as const) {
    const ds = buildFinanceForecastDataset({
      media_plan_versions: [
        baseApprovedVersion({
          mba_number: "MBA-CXL",
          campaign_status: "Cancelled",
        }),
      ],
      clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
      publishers: [pub],
      financial_year_start_year: FY_START,
      scenario,
    })
    assert.equal(ds.client_blocks.length, 0, `expected no blocks for ${scenario}`)
  }
})

test("confirmed scenario excludes unknown/non-whitelisted statuses after normalisation", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        mba_number: "MBA-WEIRD",
        campaign_status: "   pending legal   ",
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  assert.equal(ds.client_blocks.length, 0)
})

test("whitespace-trimmed approved status still passes confirmed filter", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      baseApprovedVersion({
        mba_number: "MBA-TRIM",
        campaign_status: "  Approved ",
      }),
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  assert.equal(ds.client_blocks.length, 1)
})

test("billingSchedule may be a JSON string (Xano transport)", () => {
  const pub = fixturePublisherAssembledMedia({ publisher_name: "Seven Network" })
  const schedule = [
    {
      monthYear: "2025-07",
      mediaTypes: [
        {
          mediaType: "Television",
          lineItems: [{ header1: "Seven Network", amount: 4_200, clientPaysForMedia: false }],
        },
      ],
    },
  ]
  const ds = buildFinanceForecastDataset({
    media_plan_versions: [
      {
        ...baseApprovedVersion(),
        billingSchedule: JSON.stringify(schedule) as unknown as FinanceForecastMediaPlanVersionInput["billingSchedule"],
      },
    ],
    clients: [{ id: "c1", mp_client_name: "Test Client Pty Ltd" }],
    publishers: [pub],
    financial_year_start_year: FY_START,
    scenario: "confirmed",
  })
  assert.equal(assembledMediaBillingLine(ds).monthly.july, 4_200)
})
