import assert from "node:assert/strict"
import test from "node:test"

import { extractAndFormatBursts } from "@/lib/mediaplan/formatBurstsForPersist"

/** Matches Xano-bound JSON: undefined keys are omitted by JSON.stringify. */
function assertPersistedBursts(actual: unknown[], expected: readonly unknown[]) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected))
}

/** Golden fixtures: exact persisted burst shape from extractAndFormatBursts (baseline C7 Phase A). */
const GOLDEN = {
  burstsArray: [
    {
      budget: "$11,000.00",
      buyAmount: "10000",
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      calculatedValue: 0,
      mediaAmount: "$11,000.00",
      feeAmount: "$1,222.22",
    },
  ],
  burstsJsonString: [
    {
      budget: "5500",
      buyAmount: "5000",
      startDate: "2026-02-01",
      endDate: "2026-02-07",
      calculatedValue: 1,
      mediaAmount: "$5,500.00",
      feeAmount: "$500.00",
    },
  ],
  burstsJsonArray: [
    {
      budget: "$2,200.00",
      buyAmount: "$2,000.00",
      startDate: "2026-03-01",
      endDate: "2026-03-07",
      calculatedValue: 0,
      mediaAmount: "$2,200.00",
      feeAmount: "$244.44",
    },
  ],
  singletonObject: [
    {
      budget: "$1,000.00",
      buyAmount: "$900.00",
      startDate: "2026-04-01",
      endDate: "2026-04-07",
      calculatedValue: 0,
      mediaAmount: "$1,000.00",
      feeAmount: "$111.11",
    },
  ],
  malformedJson: [] as unknown[],
  emptyJson: [] as unknown[],
  noBursts: [] as unknown[],
  extraFields: [
    {
      budget: "$11,000.00",
      buyAmount: "10000",
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      calculatedValue: 0,
      mediaAmount: "$11,000.00",
      feeAmount: "$1,222.22",
      adServingRatePct: 2.5,
      adServingImpressions: 100000,
      size: "30s",
      tarps: 150,
    },
  ],
  moneyDefault: [
    {
      budget: "$11,000.00",
      buyAmount: "",
      startDate: "2026-01-01",
      endDate: "2026-01-07",
      calculatedValue: 0,
      mediaAmount: "$11,000.00",
      feeAmount: "$1,222.22",
    },
  ],
  budgetIncludesFees: [
    {
      budget: "$11,000.00",
      buyAmount: "",
      startDate: "2026-01-01",
      endDate: "2026-01-07",
      calculatedValue: 0,
      mediaAmount: "$9,900.00",
      feeAmount: "$1,100.00",
    },
  ],
  clientPaysForMedia: [
    {
      budget: "$11,000.00",
      buyAmount: "",
      startDate: "2026-01-01",
      endDate: "2026-01-07",
      calculatedValue: 0,
      mediaAmount: "$11,000.00",
      feeAmount: "$1,222.22",
    },
  ],
  feeDerived: [
    {
      budget: "11000",
      buyAmount: "",
      startDate: "2026-01-01",
      endDate: "2026-01-07",
      calculatedValue: 0,
      mediaAmount: "$11,000.00",
      feeAmount: "$1,000.00",
    },
  ],
  explicitFeePct: [
    {
      budget: "$11,000.00",
      buyAmount: "",
      startDate: "2026-01-01",
      endDate: "2026-01-07",
      calculatedValue: 0,
      mediaAmount: "$11,000.00",
      feeAmount: "$1,941.18",
    },
  ],
  dateObject: [
    {
      budget: "$1,000.00",
      buyAmount: "",
      startDate: "2026-06-16",
      endDate: "2026-06-22",
      calculatedValue: 0,
      mediaAmount: "$1,000.00",
      feeAmount: "$111.11",
    },
  ],
  preStringifiedDate: [
    {
      budget: "$1,000.00",
      buyAmount: "",
      startDate: "2026-06-16",
      endDate: "2026-06-22",
      calculatedValue: 0,
      mediaAmount: "$1,000.00",
      feeAmount: "$111.11",
    },
  ],
} as const

test("spots line calculatedValue persists through extractAndFormatBursts (Symptom 1)", () => {
  const result = extractAndFormatBursts(
    {
      bursts: [
        {
          budget: "25000",
          buyAmount: "50",
          startDate: "2026-01-05",
          endDate: "2026-01-11",
          calculatedValue: 500,
        },
      ],
      buy_type: "spots",
      budget_includes_fees: false,
      client_pays_for_media: false,
    },
    0,
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].calculatedValue, 500)
})

test("bursts array input (Radio-style): _reactKey dropped, mediaAmount/feeAmount added", () => {
  const result = extractAndFormatBursts(
    {
      bursts: [
        {
          budget: 11000,
          buyAmount: "10000",
          startDate: "2026-01-05",
          endDate: "2026-01-11",
          calculatedValue: 0,
          _reactKey: "rk-1",
          fee: 500,
        },
      ],
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.burstsArray)
  assert.equal("_reactKey" in result[0], false)
  assert.equal("fee" in result[0], false)
})

test("bursts_json string input: parsed and serialized", () => {
  const result = extractAndFormatBursts({
    bursts_json: JSON.stringify([
      {
        budget: "5500",
        buyAmount: "5000",
        startDate: "2026-02-01",
        endDate: "2026-02-07",
        calculatedValue: 1,
        mediaAmount: "$4,500.00",
        feeAmount: "$500.00",
      },
    ]),
  })
  assertPersistedBursts(result, GOLDEN.burstsJsonString)
})

test("bursts_json native array input (TV/Newspaper/Social)", () => {
  const result = extractAndFormatBursts(
    {
      bursts_json: [
        {
          budget: 2200,
          buyAmount: 2000,
          startDate: "2026-03-01",
          endDate: "2026-03-07",
          calculatedValue: 0,
        },
      ],
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.burstsJsonArray)
})

test("singleton bursts_json object wrapped to array", () => {
  const result = extractAndFormatBursts(
    {
      bursts_json: {
        budget: 1000,
        buyAmount: 900,
        startDate: "2026-04-01",
        endDate: "2026-04-07",
        calculatedValue: 0,
      },
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.singletonObject)
})

test("singleton bursts object (non-array) wrapped to array", () => {
  const result = extractAndFormatBursts(
    {
      bursts: {
        budget: 1000,
        buyAmount: 900,
        startDate: "2026-04-01",
        endDate: "2026-04-07",
        calculatedValue: 0,
      },
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.singletonObject)
})

test("malformed bursts_json returns empty array", () => {
  assertPersistedBursts(extractAndFormatBursts({ bursts_json: "{not json" }), GOLDEN.malformedJson)
})

test("empty/whitespace bursts_json returns empty array", () => {
  assertPersistedBursts(extractAndFormatBursts({ bursts_json: "   " }), GOLDEN.emptyJson)
})

test("missing bursts returns empty array", () => {
  assertPersistedBursts(extractAndFormatBursts({}), GOLDEN.noBursts)
})

test("extra-field passthrough: size/tarps/adServing preserved; legacy fee dropped", () => {
  const result = extractAndFormatBursts(
    {
      bursts: [
        {
          budget: 11000,
          buyAmount: "10000",
          startDate: "2026-01-05",
          endDate: "2026-01-11",
          calculatedValue: 0,
          size: "30s",
          tarps: 150,
          adServingRatePct: 2.5,
          adServingImpressions: 100000,
          fee: 999,
        },
      ],
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.extraFields)
  assert.equal("fee" in result[0], false)
})

test("money math default flags: en-AU mediaAmount/feeAmount strings", () => {
  const result = extractAndFormatBursts(
    {
      bursts: [
        {
          budget: 11000,
          buyAmount: "",
          startDate: "2026-01-01",
          endDate: "2026-01-07",
          calculatedValue: 0,
        },
      ],
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.moneyDefault)
})

test("money math budgetIncludesFees=true", () => {
  const result = extractAndFormatBursts(
    {
      budgetIncludesFees: true,
      bursts: [
        {
          budget: 11000,
          buyAmount: "",
          startDate: "2026-01-01",
          endDate: "2026-01-07",
          calculatedValue: 0,
        },
      ],
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.budgetIncludesFees)
})

test("money math clientPaysForMedia=true", () => {
  const result = extractAndFormatBursts(
    {
      clientPaysForMedia: true,
      bursts: [
        {
          budget: 11000,
          buyAmount: "",
          startDate: "2026-01-01",
          endDate: "2026-01-07",
          calculatedValue: 0,
        },
      ],
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.clientPaysForMedia)
})

test("fee-% derived from serialized feeAmount when line item has no feePct", () => {
  const result = extractAndFormatBursts({
    bursts: [
      {
        budget: "11000",
        buyAmount: "",
        startDate: "2026-01-01",
        endDate: "2026-01-07",
        calculatedValue: 0,
        mediaAmount: "$10,000.00",
        feeAmount: "$1,000.00",
      },
    ],
  })
  assertPersistedBursts(result, GOLDEN.feeDerived)
})

test("explicit feePct honoured over serialized feeAmount", () => {
  const result = extractAndFormatBursts(
    {
      bursts: [
        {
          budget: 11000,
          buyAmount: "",
          startDate: "2026-01-01",
          endDate: "2026-01-07",
          calculatedValue: 0,
          mediaAmount: "$9,000.00",
          feeAmount: "$1,000.00",
        },
      ],
    },
    15
  )
  assertPersistedBursts(result, GOLDEN.explicitFeePct)
})

test("Date object start/end → Melbourne YYYY-MM-DD strings", () => {
  const result = extractAndFormatBursts(
    {
      bursts: [
        {
          budget: 1000,
          buyAmount: "",
          startDate: new Date("2026-06-15T14:00:00.000Z"),
          endDate: new Date("2026-06-21T14:00:00.000Z"),
          calculatedValue: 0,
        },
      ],
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.dateObject)
})

test("pre-stringified date strings pass through unchanged", () => {
  const result = extractAndFormatBursts(
    {
      bursts: [
        {
          budget: 1000,
          buyAmount: "",
          startDate: "2026-06-16",
          endDate: "2026-06-22",
          calculatedValue: 0,
        },
      ],
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.preStringifiedDate)
})

test("bursts array wins over bursts_json when both present", () => {
  const result = extractAndFormatBursts(
    {
      bursts: [
        {
          budget: 11000,
          buyAmount: "10000",
          startDate: "2026-01-05",
          endDate: "2026-01-11",
          calculatedValue: 0,
        },
      ],
      bursts_json: JSON.stringify([
        {
          budget: 999,
          buyAmount: "1",
          startDate: "2099-01-01",
          endDate: "2099-01-07",
          calculatedValue: 99,
        },
      ]),
    },
    10
  )
  assertPersistedBursts(result, GOLDEN.burstsArray)
})
