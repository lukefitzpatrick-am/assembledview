import assert from "node:assert/strict"
import test from "node:test"

import {
  audienceDefinitionPlaceholder,
  audienceReachCommentary,
  countModelledChannels,
  modelledChannelsFootnote,
  uploadedRunProvenanceLine,
} from "../plannerDeckProvenance.js"

test("composed definition placeholder is definition then stats with no extra lines", () => {
  const definition = "NAT · all · 25-34, 35-49 · addressable · All People"
  const stats = "Size 1,234 '000s · 4.1% of 14+ · n 800"
  assert.equal(
    audienceDefinitionPlaceholder(definition, stats, null),
    `${definition}\n${stats}`
  )
})

test("uploaded provenance sits under the definition block before stats", () => {
  const definition = "NAT · all · 25-34 · total · All People"
  const stats = "Size 900 '000s"
  const provenance = uploadedRunProvenanceLine({
    fileName: "Grocery buyers.xlsx",
    waveCode: "APR26",
    filterLabel: "Grocery buyers",
  })
  assert.equal(
    provenance,
    "Source: uploaded Roy Morgan run — Grocery buyers.xlsx, wave APR26, filtered to Grocery buyers"
  )
  assert.equal(
    audienceDefinitionPlaceholder(definition, stats, provenance),
    `${definition}\n${provenance}\n${stats}`
  )
})

test("All cases / empty filter omits the filtered-to clause", () => {
  assert.equal(
    uploadedRunProvenanceLine({
      fileName: "run.xlsx",
      waveCode: "JAN26",
      filterLabel: "All cases",
    }),
    "Source: uploaded Roy Morgan run — run.xlsx, wave JAN26"
  )
  assert.equal(
    uploadedRunProvenanceLine({
      fileName: "run.xlsx",
      waveCode: "JAN26",
      filterLabel: null,
    }),
    "Source: uploaded Roy Morgan run — run.xlsx, wave JAN26"
  )
})

test("composed audiences get no provenance line", () => {
  assert.equal(
    uploadedRunProvenanceLine({
      source: "composed",
      fileName: "run.xlsx",
      waveCode: "JAN26",
    }),
    null
  )
})

test("modelled footnote only when n > 0; composed commentary stays today's text", () => {
  const today =
    "Reach architecture for Core · Addressable basis · wave APR26"
  assert.equal(modelledChannelsFootnote(0), null)
  assert.equal(audienceReachCommentary(today, 0), today)
  assert.equal(
    modelledChannelsFootnote(3),
    "3 channels modelled from group totals or benchmarks — see the planner for detail."
  )
  assert.equal(
    audienceReachCommentary(today, 3),
    `${today}\n3 channels modelled from group totals or benchmarks — see the planner for detail.`
  )
})

test("countModelledChannels counts inherited and benchmark-only taxonomy rows", () => {
  assert.equal(
    countModelledChannels([
      { mappingProvenance: "matched" },
      { mappingProvenance: "inherited" },
      { mappingProvenance: "benchmark-only" },
      {},
    ]),
    2
  )
})
