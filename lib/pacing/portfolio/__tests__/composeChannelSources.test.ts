import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { assembleCampaignPacingRows } from "../assembleCampaignPacingRows.js"
import { loadPortfolioChannelSources } from "../loadPortfolioChannelSources.js"
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
})
