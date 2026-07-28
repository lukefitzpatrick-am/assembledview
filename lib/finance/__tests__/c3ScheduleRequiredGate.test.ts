import { describe, expect, it, vi } from "vitest"

import type { BillingMonth } from "@/lib/billing/types"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import {
  applyC3ScheduleRequiredGate,
  channelLabelsFromLineItems,
  formatChannelListForC3,
  formatC3ScheduleRequiredUserMessage,
  PLANC_C3_LOG_PREFIX,
  PLANC_C3_SCHEDULE_REQUIRED_CODE,
  resolvePlanCC3ScheduleRequiredMode,
  scheduleHasLineDetail,
} from "../c3ScheduleRequiredGate"
import { humaniseBillingSaveError } from "../humaniseBillingSaveError"

function withMode<T>(mode: string, fn: () => T): T {
  const prev = process.env.PLANC_C3_SCHEDULE_REQUIRED
  process.env.PLANC_C3_SCHEDULE_REQUIRED = mode
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.PLANC_C3_SCHEDULE_REQUIRED
    else process.env.PLANC_C3_SCHEDULE_REQUIRED = prev
  }
}

function monthWithLines(channels: string[]): BillingMonth {
  const lineItems: NonNullable<BillingMonth["lineItems"]> = {}
  for (const ch of channels) {
    ;(lineItems as Record<string, unknown>)[ch] = [
      {
        id: `${ch}-1`,
        header1: ch,
        header2: "",
        monthlyAmounts: { "Jun 2026": 1000 },
        totalAmount: 1000,
      },
    ]
  }
  return {
    monthYear: "Jun 2026",
    mediaTotal: "1000",
    feeTotal: "0",
    totalAmount: "1000",
    adservingTechFees: "0",
    production: "0",
    mediaCosts: {
      search: "0",
      socialMedia: "0",
      television: "0",
      radio: "0",
      newspaper: "0",
      magazines: "0",
      ooh: "0",
      cinema: "0",
      digiDisplay: "0",
      digiAudio: "0",
      digiVideo: "0",
      bvod: "0",
      integration: "0",
      progDisplay: "0",
      progVideo: "0",
      progBvod: "0",
      progAudio: "0",
      progOoh: "0",
      influencers: "0",
      production: "0",
    },
    lineItems,
  }
}

const emptySchedule: BillingMonth[] = []

const radioOohLines: LineItemInput[] = [
  {
    lineItemId: "R1",
    mediaType: "radio",
    buyType: "fixed cost",
    rate: 1,
    enteredAmount: 5000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 10,
    bursts: [],
    approval: "approved",
  },
  {
    lineItemId: "O1",
    mediaType: "ooh",
    buyType: "fixed cost",
    rate: 1,
    enteredAmount: 3000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 10,
    bursts: [],
    approval: "approved",
  },
]

describe("c3ScheduleRequiredGate", () => {
  it("resolvePlanCC3ScheduleRequiredMode defaults to off", () => {
    withMode("", () => {
      expect(resolvePlanCC3ScheduleRequiredMode()).toBe("off")
    })
    withMode("enforce", () => {
      expect(resolvePlanCC3ScheduleRequiredMode()).toBe("enforce")
    })
    withMode("LOG", () => {
      expect(resolvePlanCC3ScheduleRequiredMode()).toBe("log")
    })
  })

  it("formatChannelListForC3 joins with and", () => {
    expect(formatChannelListForC3(["Radio"])).toBe("Radio")
    expect(formatChannelListForC3(["Radio", "OOH"])).toBe("Radio and OOH")
    expect(formatChannelListForC3(["Radio", "OOH", "Search"])).toBe(
      "Radio, OOH and Search"
    )
  })

  it("blocked under enforce when booked without schedule line detail", () => {
    const labels = channelLabelsFromLineItems(radioOohLines)
    const result = applyC3ScheduleRequiredGate({
      mode: "enforce",
      targetStatus: "booked",
      billingSchedule: emptySchedule,
      channelLabels: labels,
      meta: { mba_number: "TEST001", version: 1 },
    })
    expect(result.shouldReject).toBe(true)
    if (!result.shouldReject || result.mode !== "enforce") {
      throw new Error("expected enforce reject")
    }
    expect(result.status).toBe(409)
    expect(result.body.code).toBe(PLANC_C3_SCHEDULE_REQUIRED_CODE)
    expect(result.body.userMessage).toBe(
      "Radio and OOH have line items but no billing schedule was saved"
    )
    expect(humaniseBillingSaveError(result.body)).toBe(
      "Radio and OOH have line items but no billing schedule was saved"
    )
  })

  it("allowed with a valid schedule (line detail)", () => {
    const labels = channelLabelsFromLineItems(radioOohLines)
    const result = applyC3ScheduleRequiredGate({
      mode: "enforce",
      targetStatus: "approved",
      billingSchedule: [monthWithLines(["radio", "ooh"])],
      channelLabels: labels,
    })
    expect(result.shouldReject).toBe(false)
    expect(scheduleHasLineDetail([monthWithLines(["radio"])])).toBe(true)
  })

  it("allowed for draft transitions", () => {
    const labels = channelLabelsFromLineItems(radioOohLines)
    const result = applyC3ScheduleRequiredGate({
      mode: "enforce",
      targetStatus: "draft",
      billingSchedule: emptySchedule,
      channelLabels: labels,
    })
    expect(result.shouldReject).toBe(false)
  })

  it("log mode never blocks", () => {
    const labels = channelLabelsFromLineItems(radioOohLines)
    const spy = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      const result = applyC3ScheduleRequiredGate({
        mode: "log",
        targetStatus: "booked",
        billingSchedule: null,
        channelLabels: labels,
        meta: { mba_number: "LOG001", version: 2 },
      })
      expect(result.shouldReject).toBe(false)
      expect(result.mode).toBe("log")
      if (result.mode === "log") expect(result.wouldReject).toBe(true)
      expect(
        spy.mock.calls.some(
          (entry) =>
            entry[0] === PLANC_C3_LOG_PREFIX &&
            String(entry[1]).includes("LOG001")
        )
      ).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it("off mode is a no-op", () => {
    const result = applyC3ScheduleRequiredGate({
      mode: "off",
      targetStatus: "booked",
      billingSchedule: null,
      channelLabels: ["Radio"],
    })
    expect(result.shouldReject).toBe(false)
    expect(result.mode).toBe("off")
  })

  it("formatC3ScheduleRequiredUserMessage matches brief copy", () => {
    expect(formatC3ScheduleRequiredUserMessage(["Radio", "OOH"])).toBe(
      "Radio and OOH have line items but no billing schedule was saved"
    )
  })
})
