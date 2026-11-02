import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

import type { KpiTargets, SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types"
import {
  buildKpiComparisons,
  computeRowKpiStatus,
  reduceRowKpiStatus,
  resolveDollarTarget,
  resolveRatioTarget,
  statusForHigherIsBetter,
  statusForLowerIsBetter,
  variancePercent,
} from "@/lib/pacing/kpi/computeKpiStatus"
import {
  buildProgrammaticKpiComparisons,
  computeProgrammaticRowKpiStatus,
} from "@/lib/pacing/programmatic/computeProgrammaticKpiStatus"
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types"
import {
  buildSocialKpiComparisons,
  computeSocialRowKpiStatus,
} from "@/lib/pacing/social/computeSocialKpiStatus"
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types"

/**
 * B3 (Q9, MATH-9): one set of KPI comparison helpers for Search, Programmatic
 * and Social. A 0 target means "not set" on every channel. Before this, Search
 * passed 0 through, `actual >= 0 * 0.9` was always true, and a Search line with
 * a 0 CTR target always read "KPIs on track".
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..")

function targets(over: Partial<KpiTargets>): KpiTargets {
  return {
    mediaType: "search",
    publisher: null,
    bidStrategy: null,
    ctr: null,
    cpv: null,
    conversionRate: null,
    vtr: null,
    frequency: null,
    ...over,
  }
}

/** CTR 0.5% and conversion rate 2% actuals. */
function searchRow(kpiTargets: KpiTargets | null): SearchPacingCampaignRow {
  return { impressions: 10_000, clicks: 50, conversions: 1, ctr: 0.005, kpiTargets } as SearchPacingCampaignRow
}

function programmaticRow(kpiTargets: KpiTargets | null): ProgrammaticPacingCampaignRow {
  return { ctr: 0.005, conversionRate: 0.02, cpv: null, vtr: null, planCpvRate: null, kpiTargets } as unknown as ProgrammaticPacingCampaignRow
}

function socialRow(kpiTargets: KpiTargets | null): SocialPacingCampaignRow {
  return { ctr: 0.005, conversionRate: 0.02, cpv: null, vtr: null, planCpvRate: null, kpiTargets } as unknown as SocialPacingCampaignRow
}

describe("Q9: Search treats a 0 target as not set", () => {
  it("0 CTR and 0 conversion-rate targets read KPI pending, not on track (the bug)", () => {
    const row = searchRow(targets({ ctr: 0, conversionRate: 0 }))
    const [ctr, cvr] = buildKpiComparisons(row)
    assert.equal(ctr!.target, null)
    assert.equal(ctr!.status, "no-target")
    assert.equal(cvr!.target, null)
    assert.equal(cvr!.status, "no-target")
    assert.equal(computeRowKpiStatus(row), "kpi-pending")
  })

  it("a 0 CTR target no longer props up the row: a real conversion target decides", () => {
    // Conversion rate 2% vs 5% target: off. Before, the 0 CTR target made it "mixed".
    const row = searchRow(targets({ ctr: 0, conversionRate: 0.05 }))
    assert.equal(computeRowKpiStatus(row), "kpi-off-target")
  })

  it("real targets are unchanged: 0.5% CTR vs 0.5% target is on track, variance 0", () => {
    const row = searchRow(targets({ ctr: 0.005, conversionRate: 0.02 }))
    const [ctr] = buildKpiComparisons(row)
    assert.equal(ctr!.status, "on-track")
    assert.equal(ctr!.variancePercent, 0)
    assert.equal(computeRowKpiStatus(row), "kpi-on-track")
    assert.equal(computeRowKpiStatus(searchRow(null)), "kpi-pending")
  })

  it("all three channels agree on the same targets", () => {
    for (const t of [
      targets({ ctr: 0, conversionRate: 0 }),
      targets({ ctr: 0, conversionRate: 0.05 }),
      targets({ ctr: 0.004, conversionRate: 0.02 }),
      targets({ ctr: 0.01, conversionRate: 0.03 }),
    ]) {
      const search = computeRowKpiStatus(searchRow(t))
      assert.equal(computeProgrammaticRowKpiStatus(programmaticRow(t)), search, JSON.stringify(t))
      assert.equal(computeSocialRowKpiStatus(socialRow(t)), search, JSON.stringify(t))
      const pick = (cs: Array<{ metric: string; target: number | null; status: string }>) =>
        cs.filter((c) => c.metric === "ctr" || c.metric === "conversionRate").map((c) => [c.metric, c.target, c.status])
      assert.deepEqual(pick(buildProgrammaticKpiComparisons(programmaticRow(t))), pick(buildKpiComparisons(searchRow(t))))
      assert.deepEqual(pick(buildSocialKpiComparisons(socialRow(t))), pick(buildKpiComparisons(searchRow(t))))
    }
  })
})

describe("Q9: the shared helpers", () => {
  it("unset and status rules", () => {
    assert.equal(resolveRatioTarget(0), null)
    assert.equal(resolveRatioTarget(undefined), null)
    assert.equal(resolveRatioTarget(0.02), 0.02)
    assert.equal(resolveDollarTarget(0), null)
    assert.equal(resolveDollarTarget(0.05), 0.05)
    assert.equal(statusForHigherIsBetter(null, 0.5), "no-target")
    assert.equal(statusForHigherIsBetter(0.1, null), "no-delivery")
    assert.equal(statusForHigherIsBetter(0.1, 0.091), "on-track", "within 10%")
    assert.equal(statusForHigherIsBetter(0.1, 0.089), "off-target")
    assert.equal(statusForLowerIsBetter(0.1, 0.11), "on-track")
    assert.equal(statusForLowerIsBetter(0.1, 0.111), "off-target")
    assert.equal(variancePercent(0, 1), null)
    assert.equal(variancePercent(0.02, 0.03)?.toFixed(6), (50).toFixed(6))
    assert.equal(reduceRowKpiStatus([{ status: "no-target" }]), "kpi-pending")
    assert.equal(reduceRowKpiStatus([{ status: "no-delivery" }, { status: "no-target" }]), "kpi-no-delivery")
    assert.equal(reduceRowKpiStatus([{ status: "on-track" }, { status: "off-target" }]), "kpi-mixed")
    assert.equal(reduceRowKpiStatus([{ status: "off-target" }]), "kpi-off-target")
    assert.equal(reduceRowKpiStatus([{ status: "on-track" }, { status: "no-target" }]), "kpi-on-track")
  })

  it("Programmatic and Social import the helpers instead of copying them", () => {
    for (const rel of [
      "lib/pacing/programmatic/computeProgrammaticKpiStatus.ts",
      "lib/pacing/social/computeSocialKpiStatus.ts",
    ]) {
      const src = readFileSync(join(ROOT, rel), "utf8")
      assert.doesNotMatch(
        src,
        /function (unsetAsNull|resolveRatioTarget|resolveDollarTarget|statusForHigherIsBetter|statusForLowerIsBetter|variancePercent)\(/,
        rel,
      )
      assert.match(src, /reduceRowKpiStatus\(/, rel)
      assert.doesNotMatch(src, /KPI_TOLERANCE/, rel)
    }
  })
})
