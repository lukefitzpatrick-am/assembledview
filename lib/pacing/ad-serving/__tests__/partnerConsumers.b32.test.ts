/**
 * B32: every `/pacing` consumer of the ad-serving row labels a Channel
 * Factory partner-reported row as partner-reported, not CM360 verification,
 * and every row without a Channel Factory publisher renders byte-identical
 * to 37bec7e1 (hashes below were produced by this code on 37bec7e1).
 *
 * Consumers: Ad Serving tab cards (`lineCardFromAdServing`; the table reads
 * `adServingDeliverySourceLabel`), overview, portfolio, campaign detail (line
 * cards plus portfolio channels), ops digest (fallback and snapshot rows), AVA.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { AS_OF, COUNT_TO, cm360Rows, partnerRows } from "./b32Fixtures"
import type { AdServingPacingCampaignRow } from "../types"

const skip = mockModuleSkip()
const h = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")

/** 37bec7e1 outputs for `cm360Rows()`. */
const PINS = {
  cards: "6cb16d714da3832c5965f82e43db1dd1c91ef72ef88ce5c38e34f65b2d953a08",
  overview: "d517a40f610d8476a6ab7c197c1ba1e7343fda87f3a08f68c7b76d4cb2ef5fa9",
  counts: "fee1153e2ee954a048739f59cdb884762d4e011560dc3c160e72a21becb3f272",
  portfolio: "9ba52f04f431250b9f81be6a708a41e3ef0eec1f5ae53b86b4a4af8bb6ca3411",
  digest: "8b2c9ad2f424ef6425035e7ffe5d46c678d21df9b0f3f065f68c701b6ff1c0f3",
  digestSnap: "861f77fb887d448c3b2cb568772915c53d7fd8bc7fbd9139a2bb3c197de0d548",
  ava: "ff492defc03fe44e9d8936ea61e620741baf8c519830fa86e66c5c39c5e4c25c",
}

let adRows: unknown[] = []
if (supportsMockModule()) {
  await mock.module!("@/lib/xano/ava", { namedExports: { getAvaXanoSummary: async () => "plan" } })
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      getCachedSearchPacingRows: async () => [],
      getCachedSocialPacingRows: async () => [],
      getCachedProgrammaticPacingRows: async () => [],
      getCachedAdServingPacingRows: async () => adRows,
      getCachedDirectPacingRows: async () => [],
    },
  })
}

async function consumers() {
  const { lineCardFromAdServing } = await import("../../channel/lineCardModel.js")
  const { mapAdServingRowToOverviewItem } = await import("../../overview/mapOverviewItems.js")
  const { countAdServingOverviewStatus } = await import("../../overview/countChannelOverviewStatus.js")
  const { assembleCampaignPacingRows } = await import("../../portfolio/assembleCampaignPacingRows.js")
  const { buildAdServingDigestCampaignRows, digestRowsFromPortfolioCampaigns } = await import(
    "../../../ops/digest/banding.js"
  )
  const { getPacingSnapshotTool } = await import("../../../ava/tools/getPacingSnapshot.js")
  const { adServingDeliverySourceLabel } = await import("../deliverySourceLabel.js")
  return async (rows: AdServingPacingCampaignRow[]) => {
    const cards = rows.map((r) => lineCardFromAdServing(structuredClone(r), COUNT_TO))
    // Same argument shape as `buildOverviewPayload` and `countAdServingOverviewStatus`.
    const overview = rows.map((r) =>
      mapAdServingRowToOverviewItem({
        clientName: r.clientName,
        campaignName: r.campaignName,
        mbaNumber: r.mbaNumber,
        lineItemId: r.lineItemId,
        lineItemLabel: r.creative || r.lineItemId,
        lineItemStatus: r.lineItemStatus,
        ...(r.deliverySource ? { deliverySource: r.deliverySource } : {}),
      }),
    )
    const counts = countAdServingOverviewStatus(structuredClone(rows))
    const portfolio = assembleCampaignPacingRows({
      asOfDate: AS_OF,
      countToDate: COUNT_TO,
      allowedClientSlugs: null,
      search: [],
      social: [],
      programmatic: [],
      adServing: structuredClone(rows),
      direct: [],
      schedulesByMba: new Map(),
    })
    const digest = buildAdServingDigestCampaignRows(structuredClone(rows), COUNT_TO)
    const digestSnap = digestRowsFromPortfolioCampaigns(portfolio)
    adRows = structuredClone(rows)
    const ava = await getPacingSnapshotTool.execute({ clientSlug: "acme" }, { roles: ["admin"] } as never)
    const avaBody = JSON.parse(String(ava.content)) as Record<string, unknown> & {
      rows: Array<Record<string, unknown>>
    }
    delete avaBody.asOfDate
    delete avaBody.countedTo
    const table = rows.map((r) => adServingDeliverySourceLabel(r.deliverySource))
    return { cards, overview, counts, portfolio, digest, digestSnap, avaBody, table }
  }
}

test("B32: rows without a Channel Factory publisher are byte-identical in every consumer", { skip }, async () => {
  const run = await consumers()
  const out = await run(cm360Rows())
  assert.equal(h(out.cards), PINS.cards)
  assert.equal(h(out.overview), PINS.overview)
  assert.equal(h(out.counts), PINS.counts)
  assert.equal(h(out.portfolio), PINS.portfolio)
  assert.equal(h(out.digest), PINS.digest)
  assert.equal(h(out.digestSnap), PINS.digestSnap)
  assert.equal(h(out.avaBody), PINS.ava)
  assert.ok(out.table.every((label) => label === null))
  for (const card of out.cards) assert.equal(card.kpis[0]?.label, "Verification only")
})

test("B32: CM360 campaigns are unchanged when partner rows share the book", { skip }, async () => {
  const run = await consumers()
  const alone = await run(cm360Rows())
  const mixed = await run([...cm360Rows(), ...partnerRows()])
  const cmMbas = new Set(cm360Rows().map((r) => r.mbaNumber))
  const keep = <T extends { mbaNumber: string }>(xs: T[]) => xs.filter((x) => cmMbas.has(x.mbaNumber))
  assert.equal(h(mixed.cards.slice(0, alone.cards.length)), PINS.cards)
  assert.equal(h(keep(mixed.portfolio)), h(alone.portfolio))
  assert.equal(h(keep(mixed.digest)), h(alone.digest))
  assert.equal(h(keep(mixed.digestSnap)), h(alone.digestSnap))
  assert.equal(h(keep(mixed.avaBody.rows as Array<{ mbaNumber: string }>)), h(alone.avaBody.rows))
})

test("B32: partner rows are labelled partner-reported in every consumer", { skip }, async () => {
  const run = await consumers()
  const out = await run(partnerRows())

  // Ad Serving tab: table label, and the cards (also the campaign detail lines).
  assert.deepEqual(out.table, Array(3).fill("Partner-reported (Channel Factory)"))
  for (const card of out.cards) {
    assert.equal(card.platform, "Channel Factory")
    assert.equal(card.kpis[0]?.label, "Partner-reported")
    assert.equal(card.kpis[0]?.delivered, "Channel Factory")
    assert.equal(card.metrics[0]?.label, "Impressions")
    assert.ok(!JSON.stringify(card).includes("CM360"), card.lineItemId)
    assert.ok(!JSON.stringify(card).includes("Verification"), card.lineItemId)
    assert.equal(card.verificationOnly, true, "counts-only card, no spend columns")
  }

  // Overview.
  for (const item of out.overview) assert.equal(item.sourceLabel, "Partner-reported (Channel Factory)")
  assert.equal(out.counts.onTrack, 3)

  // Portfolio (and campaign detail channels): estimated spend on the dashboard rule, labelled.
  const byMba = new Map(out.portfolio.map((row) => [row.mbaNumber, row]))
  const penfold = byMba.get("PENFOLD020")!.channels
  assert.equal(penfold.length, 1)
  assert.equal(penfold[0]!.label, "Digital Video · Channel Factory (partner-reported)")
  assert.equal(penfold[0]!.spendMode, "estimated")
  // One line-total day, so it rounds once: $11,609.93 here, $11,609.92 on the
  // dashboard (rounded per day). Same rule (`estimateDirectDigitalSpend`), as for every CM360 line.
  assert.equal(penfold[0]!.spendToDate, 11609.93)
  assert.equal(penfold[0]!.sourceState, "reporting")
  const trwico = byMba.get("TRWICO001")!.channels
  assert.equal(trwico.length, 1)
  assert.equal(trwico[0]!.label, "Digital Video · Channel Factory (partner-reported)")
  // dv1 cpv 288,345 views x $0.08 = $23,067.60; dv2 cpm 631,051 impressions x $8 = $5,048.41.
  assert.equal(trwico[0]!.spendToDate, 28116.01)
  assert.deepEqual(trwico[0]!.lineItemIds, ["trwico001dv1", "trwico001dv2"])

  // Digest: fallback rows and snapshot rows carry the partner tag.
  for (const row of out.digest) assert.equal(row.channel, "partner-reported (Channel Factory)")
  for (const row of out.digestSnap) assert.match(row.channel, /Channel Factory \(partner-reported\)/)

  // AVA compact rows.
  assert.equal(out.avaBody.rows.length, 3)
  for (const row of out.avaBody.rows) {
    assert.equal(row.channel, "digital_video")
    assert.equal(row.deliverySource, "Partner-reported (Channel Factory)")
  }
})

test("B32: a channel or campaign with CM360 and partner lines says 'incl.'", { skip }, async () => {
  const run = await consumers()
  const cm = cm360Rows().find((r) => r.lineItemId === "golf025dv1")!
  const mixedLine = { ...partnerRows()[0]!, deliverySource: "partner_file_and_cm360" as const }
  const sameCampaign = { ...cm, mbaNumber: "PENFOLD020", lineItemId: "penfold020dv9", campaignName: "Troye Holiday FY27" }
  const out = await run([partnerRows()[0]!, sameCampaign])
  const penfold = out.portfolio.find((row) => row.mbaNumber === "PENFOLD020")!
  assert.equal(penfold.channels[0]!.label, "Digital Video · incl. Channel Factory (partner-reported)")
  assert.equal(out.digest[0]!.channel, "ad-serving, incl. partner-reported (Channel Factory)")

  const both = await run([mixedLine])
  assert.equal(both.table[0], "Partner-reported (Channel Factory) + CM360")
  assert.equal(both.cards[0]!.kpis[0]?.delivered, "Channel Factory + CM360")
  assert.equal(both.overview[0]!.sourceLabel, "Partner-reported (Channel Factory) + CM360")
  assert.equal(both.portfolio[0]!.channels[0]!.label, "Digital Video · incl. Channel Factory (partner-reported)")
  assert.equal(both.digest[0]!.channel, "ad-serving, incl. partner-reported (Channel Factory)")
  assert.equal(both.avaBody.rows[0]!.deliverySource, "Partner-reported (Channel Factory) + CM360")
})
