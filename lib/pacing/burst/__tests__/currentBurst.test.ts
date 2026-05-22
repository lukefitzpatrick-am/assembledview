import assert from "node:assert/strict"
import test from "node:test"
import { findCurrentBurstIndex, inclusiveDaysBetween } from "../currentBurst.js"

test("findCurrentBurstIndex finds the burst containing today", () => {
  const bursts = [
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    { startDate: "2026-02-01", endDate: "2026-02-28" },
    { startDate: "2026-03-01", endDate: "2026-03-31" },
  ]
  assert.equal(findCurrentBurstIndex(bursts, "2026-02-15"), 1)
})

test("findCurrentBurstIndex returns first burst on boundary (start)", () => {
  const bursts = [
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    { startDate: "2026-02-01", endDate: "2026-02-28" },
    { startDate: "2026-03-01", endDate: "2026-03-31" },
  ]
  assert.equal(findCurrentBurstIndex(bursts, "2026-02-01"), 1)
})

test("findCurrentBurstIndex returns the burst on boundary (end)", () => {
  const bursts = [
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    { startDate: "2026-02-01", endDate: "2026-02-28" },
    { startDate: "2026-03-01", endDate: "2026-03-31" },
  ]
  assert.equal(findCurrentBurstIndex(bursts, "2026-01-31"), 0)
})

test("findCurrentBurstIndex returns null when date is before any burst", () => {
  const bursts = [
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    { startDate: "2026-02-01", endDate: "2026-02-28" },
    { startDate: "2026-03-01", endDate: "2026-03-31" },
  ]
  assert.equal(findCurrentBurstIndex(bursts, "2025-12-31"), null)
})

test("findCurrentBurstIndex returns null when date is after all bursts", () => {
  const bursts = [
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    { startDate: "2026-02-01", endDate: "2026-02-28" },
    { startDate: "2026-03-01", endDate: "2026-03-31" },
  ]
  assert.equal(findCurrentBurstIndex(bursts, "2026-04-01"), null)
})

test("findCurrentBurstIndex returns null in a gap between bursts", () => {
  const gappy = [
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    { startDate: "2026-03-01", endDate: "2026-03-31" },
  ]
  assert.equal(findCurrentBurstIndex(gappy, "2026-02-15"), null)
})

test("findCurrentBurstIndex returns null for empty bursts", () => {
  assert.equal(findCurrentBurstIndex([], "2026-02-15"), null)
})

test("inclusiveDaysBetween counts inclusive days", () => {
  assert.equal(inclusiveDaysBetween("2026-01-01", "2026-01-31"), 31)
  assert.equal(inclusiveDaysBetween("2026-01-01", "2026-01-01"), 1)
})

test("inclusiveDaysBetween returns null for inverted range", () => {
  assert.equal(inclusiveDaysBetween("2026-02-01", "2026-01-01"), null)
})

test("inclusiveDaysBetween handles month/year boundaries", () => {
  assert.equal(inclusiveDaysBetween("2026-12-31", "2027-01-01"), 2)
})
