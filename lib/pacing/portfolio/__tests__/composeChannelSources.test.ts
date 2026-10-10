import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assembleCampaignPacingRows } from "../assembleCampaignPacingRows.js"
import {
  loadPortfolioChannelSources,
  type PortfolioSourceTiming,
} from "../loadPortfolioChannelSources.js"
import { p6AssembleInput } from "./p6Fixture.js"

describe("loadPortfolioChannelSources", () => {
  it("parallel compose returns the same rows as sequential on the fixture", async () => {
    const input = p6AssembleInput()
    const loaders = {
      search: async () => input.search,
      social: async () => input.social,
      programmatic: async () => input.programmatic,
      adServing: async () => input.adServing,
      direct: async () => input.direct,
    }
    const args = {
      asOfDate: input.asOfDate,
      allowedClientSlugs: input.allowedClientSlugs,
    }

    const [parallel, sequential] = await Promise.all([
      loadPortfolioChannelSources(args, loaders, { parallel: true }),
      loadPortfolioChannelSources(args, loaders, { parallel: false }),
    ])

    const parallelRows = assembleCampaignPacingRows({
      ...input,
      ...parallel,
    })
    const sequentialRows = assembleCampaignPacingRows({
      ...input,
      ...sequential,
    })

    assert.deepEqual(parallelRows, sequentialRows)
    assert.deepEqual(
      parallelRows.map((row) => row.mbaNumber),
      ["letsgo001", "jayco001", "candel001", "hartm012", "PGAAUS014", "BICAU002"],
    )
  })

  it("a source that misses its timeout fails the load and names the source", async () => {
    const input = p6AssembleInput()
    const timings: PortfolioSourceTiming[] = []
    await assert.rejects(
      () =>
        loadPortfolioChannelSources(
          { asOfDate: input.asOfDate, allowedClientSlugs: input.allowedClientSlugs },
          {
            search: async () => input.search,
            social: () => new Promise(() => {}),
            programmatic: async () => input.programmatic,
            adServing: async () => input.adServing,
            direct: async () => input.direct,
          },
          { parallel: true, perSourceTimeoutMs: 40, overallBudgetMs: 240_000, timings },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, "portfolio source timeout: social")
        return true
      },
    )

    assert.equal(timings.find((row) => row.source === "social")?.timedOut, true)
    assert.equal(timings.find((row) => row.source === "search")?.timedOut, false)
    assert.ok((timings.find((row) => row.source === "search")?.rowCount ?? 0) > 0)
  })

  it("does not start a source once the overall budget is gone", async () => {
    const input = p6AssembleInput()
    const timings: PortfolioSourceTiming[] = []
    let called = false
    const result = await loadPortfolioChannelSources(
      { asOfDate: input.asOfDate, allowedClientSlugs: input.allowedClientSlugs },
      {
        search: async () => {
          called = true
          return input.search
        },
        social: async () => input.social,
        programmatic: async () => input.programmatic,
        adServing: async () => input.adServing,
        direct: async () => input.direct,
      },
      {
        parallel: true,
        perSourceTimeoutMs: 90_000,
        overallBudgetMs: 1,
        startedAt: Date.now() - 50,
        timings,
      },
    )

    assert.equal(called, false)
    assert.equal(result.search.length, 0)
    assert.equal(timings.every((row) => row.timedOut), true)
  })
})
