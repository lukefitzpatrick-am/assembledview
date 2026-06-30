import assert from "node:assert/strict"
import test from "node:test"

import { duplicateBurst } from "../burstOperations.js"

type ToastOptions = { title: string; description: string; variant?: string }
type DuplicateBurstForm = Parameters<typeof duplicateBurst>[0]["form"]

function createForm(initialValues: Record<string, unknown>) {
  const values = new Map(Object.entries(initialValues))
  const setCalls: Array<{ path: string; value: unknown }> = []

  return {
    form: {
      getValues(path: string) {
        return values.get(path)
      },
      setValue(path: string, value: unknown) {
        values.set(path, value)
        setCalls.push({ path, value })
      },
    },
    setCalls,
    values,
  }
}

function createHarness(bursts: unknown[]) {
  const path = "radiolineItems.2.bursts"
  const { form, setCalls } = createForm({ [path]: bursts })
  const toastCalls: ToastOptions[] = []
  const afterCalls: number[] = []

  return {
    afterCalls,
    form,
    path,
    setCalls,
    toastCalls,
    duplicate() {
      duplicateBurst({
        form: form as unknown as DuplicateBurstForm,
        fieldKey: "radiolineItems",
        lineItemIndex: 2,
        onAfter: (lineItemIndex) => afterCalls.push(lineItemIndex),
        toast: (opts) => toastCalls.push(opts),
      })
    },
  }
}

test("shows a destructive toast when there is no burst to duplicate", () => {
  const harness = createHarness([])

  harness.duplicate()

  assert.equal(harness.toastCalls[0]?.title, "No burst to duplicate")
  assert.equal(harness.setCalls.length, 0)
  assert.equal(harness.afterCalls.length, 0)
})

test("shows a destructive toast when the line item already has twelve bursts", () => {
  const harness = createHarness(
    Array.from({ length: 12 }, (_, index) => ({
      startDate: new Date(2026, 0, index + 1),
      endDate: new Date(2026, 0, index + 1),
      _reactKey: `source-${index}`,
    })),
  )

  harness.duplicate()

  assert.equal(harness.toastCalls[0]?.title, "Maximum bursts reached")
  assert.equal(harness.setCalls.length, 0)
  assert.equal(harness.afterCalls.length, 0)
})

test("duplicates the last burst and carries all source fields with a fresh react key", () => {
  const sourceBurst = {
    startDate: new Date(2026, 1, 1),
    endDate: new Date(2026, 1, 28),
    adServingImpressions: 1000,
    mediaAmount: "500",
    tarps: "12",
    _reactKey: "source-key",
  }
  const harness = createHarness([
    {
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 0, 31),
      _reactKey: "first-key",
    },
    sourceBurst,
  ])

  harness.duplicate()

  assert.equal(harness.setCalls.length, 1)
  const updatedBursts = harness.setCalls[0].value as Array<typeof sourceBurst>
  const appendedBurst = updatedBursts.at(-1)
  assert.equal(appendedBurst?.adServingImpressions, 1000)
  assert.equal(appendedBurst?.mediaAmount, "500")
  assert.equal(appendedBurst?.tarps, "12")
  assert.notEqual(appendedBurst?._reactKey, sourceBurst._reactKey)
  assert.deepEqual(harness.afterCalls, [2])
})

test("advances the duplicated burst to the next day and month end", () => {
  const harness = createHarness([
    {
      startDate: new Date(2026, 2, 1),
      endDate: new Date(2026, 2, 10),
      _reactKey: "source-key",
    },
  ])

  harness.duplicate()

  const updatedBursts = harness.setCalls[0].value as Array<{
    startDate: Date
    endDate: Date
  }>
  const appendedBurst = updatedBursts.at(-1)
  assert.deepEqual(appendedBurst?.startDate, new Date(2026, 2, 11))
  assert.deepEqual(appendedBurst?.endDate, new Date(2026, 2, 31))
})

test("falls back to today when the duplicated burst has no end date", () => {
  const harness = createHarness([
    {
      startDate: new Date(2026, 2, 1),
      _reactKey: "source-key",
    },
  ])

  harness.duplicate()

  const updatedBursts = harness.setCalls[0].value as Array<{
    startDate: Date
    endDate: Date
  }>
  const appendedBurst = updatedBursts.at(-1)
  assert.ok(appendedBurst?.startDate instanceof Date)
  assert.ok(appendedBurst?.endDate instanceof Date)
  assert.equal(appendedBurst.endDate.getFullYear(), appendedBurst.startDate.getFullYear())
  assert.equal(appendedBurst.endDate.getMonth(), appendedBurst.startDate.getMonth())
  assert.equal(
    appendedBurst.endDate.getDate(),
    new Date(appendedBurst.startDate.getFullYear(), appendedBurst.startDate.getMonth() + 1, 0).getDate(),
  )
})
