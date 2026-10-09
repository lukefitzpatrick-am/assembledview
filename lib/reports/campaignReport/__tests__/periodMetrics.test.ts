import assert from "node:assert/strict"
import test from "node:test"

import { cpc, cpm, ctr } from "@/lib/money/rates"
import { campaignReportPeriodMetrics } from "@/lib/reports/campaignReport/periodMetrics"

test("video fixture keeps 3-second views and rates from delivery totals", () => {
  const spend = 9200
  const impressions = 1_200_000
  const clicks = 9800
  const expected = 1650
  const metrics = campaignReportPeriodMetrics({
    spend,
    impressions,
    clicks,
    video3sViews: 84_000,
    expectedSpend: expected,
  })

  assert.equal(metrics.cpm, cpm(spend, impressions))
  assert.equal(metrics.cpc, cpc(spend, clicks))
  assert.equal(metrics.ctr, ctr(clicks, impressions))
  assert.equal(metrics.videoViews3s, 84_000)
  assert.equal(metrics.spendPacePct, spend / expected)
})

test("a channel without video stores null 3-second views, never zero", () => {
  const metrics = campaignReportPeriodMetrics({
    spend: 6250,
    impressions: 850_000,
    clicks: 7400,
    video3sViews: 0,
    expectedSpend: 1320,
  })

  assert.equal(metrics.videoViews3s, null)
  assert.notEqual(metrics.videoViews3s, 0)
})

test("a missing video field is null", () => {
  const metrics = campaignReportPeriodMetrics({
    spend: 100,
    impressions: 1000,
    clicks: 10,
    expectedSpend: 80,
  })
  assert.equal(metrics.videoViews3s, null)
})

test("a zero-impression channel has null CPM and CTR, not zero", () => {
  const metrics = campaignReportPeriodMetrics({
    spend: 500,
    impressions: 0,
    clicks: 0,
    video3sViews: 0,
    expectedSpend: 400,
  })

  assert.equal(metrics.cpm, null)
  assert.equal(metrics.ctr, null)
  assert.equal(metrics.cpc, null)
  assert.notEqual(metrics.cpm, 0)
})

test("spend pace matches delivered divided by the period summary expected figure", () => {
  const delivered = 18450
  const expected = 4000
  const metrics = campaignReportPeriodMetrics({
    spend: delivered,
    impressions: 2_450_000,
    clicks: 18200,
    video3sViews: 12,
    expectedSpend: expected,
  })

  assert.equal(metrics.spendPacePct, delivered / expected)
  assert.equal(metrics.ctr, 18200 / 2_450_000)
})

test("spend pace is null when expected media is zero", () => {
  const metrics = campaignReportPeriodMetrics({
    spend: 100,
    impressions: 1000,
    clicks: 10,
    expectedSpend: 0,
  })
  assert.equal(metrics.spendPacePct, null)
})

test("spend pace is null when expected media is missing", () => {
  const metrics = campaignReportPeriodMetrics({
    spend: 100,
    impressions: 1000,
    clicks: 10,
    expectedSpend: null,
  })
  assert.equal(metrics.spendPacePct, null)
})
