import assert from "node:assert/strict"
import test from "node:test"

import {
  decideLineAction,
  duplicateCampaignKpiKeys,
  isEmptyKpiRow,
  parseArgs,
  resolveBenchmark,
  resolveSearchIndustry,
  runBackfill,
} from "../backfill-benchmarks.mjs"

test("isEmptyKpiRow is true when every metric is null or 0", () => {
  assert.equal(
    isEmptyKpiRow({
      ctr: null,
      conversion_rate: 0,
      vtr: 0,
      frequency: null,
    }),
    true,
  )
})

test("isEmptyKpiRow is false when any metric is non-zero", () => {
  assert.equal(
    isEmptyKpiRow({
      ctr: 0.02,
      conversion_rate: null,
      vtr: null,
      frequency: null,
    }),
    false,
  )
})

test("leftover campaign_kpi.cpv does not count as a saved target", () => {
  assert.equal(
    isEmptyKpiRow({
      ctr: null,
      conversion_rate: null,
      vtr: null,
      frequency: null,
      cpv: 0.04,
    }),
    true,
  )
})

test("all-zero existing row is an update", () => {
  const action = decideLineAction({
    channel: "social",
    publisher: "Meta",
    platform: "facebook",
    clientName: "BIC",
    existing: {
      id: 11,
      ctr: 0,
      conversion_rate: 0,
      vtr: 0,
      frequency: 0,
    },
  })
  assert.equal(action.kind, "update")
  assert.equal(action.id, 11)
  assert.equal(action.values.ctr, 0.011)
  assert.equal(action.values.conversion_rate, 0.005)
  assert.equal(action.values.vtr, 0.2)
  assert.equal(action.values.frequency, 2)
  assert.equal(action.values.target_source, "benchmark")
  assert.equal("cpv" in action.values, false)
  assert.match(action.values.benchmark_ref, /WordStream AU Q1 2026/)
})

test("missing campaign_kpi row is an insert", () => {
  const action = decideLineAction({
    channel: "search",
    publisher: "Google",
    platform: "search",
    clientName: "Unknown Client",
    existing: null,
  })
  assert.equal(action.kind, "insert")
  assert.equal(action.values.ctr, 0.066)
  assert.equal(action.values.conversion_rate, 0.082)
  assert.equal(action.values.vtr, null)
  assert.equal(action.values.frequency, null)
  assert.equal("cpv" in action.values, false)
})

test("partial row with any non-zero field is untouched", () => {
  const action = decideLineAction({
    channel: "social",
    publisher: "Meta",
    platform: "instagram",
    clientName: "BIC",
    existing: {
      id: 22,
      ctr: 0.01,
      conversion_rate: null,
      vtr: null,
      frequency: 0,
    },
  })
  assert.equal(action.kind, "skip")
  assert.equal(action.reason, "has-target")
})

test("publisher resolution: social defaults to meta; tiktok/reddit by text", () => {
  assert.equal(resolveBenchmark({ channel: "social", publisher: "", platform: "" }).key, "social-meta")
  assert.equal(
    resolveBenchmark({ channel: "social", publisher: "TikTok Ads", platform: "" }).key,
    "social-tiktok",
  )
  assert.equal(
    resolveBenchmark({ channel: "social", publisher: "x", platform: "reddit" }).key,
    "social-reddit",
  )
})

test("publisher resolution: prog video Channel Factory vs in-stream", () => {
  assert.equal(
    resolveBenchmark({
      channel: "prog_video",
      publisher: "YouTube",
      platform: "Channel Factory",
    }).key,
    "prog-video-cf",
  )
  assert.equal(
    resolveBenchmark({
      channel: "prog_video",
      publisher: "DV360",
      platform: "youtube - dv360",
    }).key,
    "prog-video-instream",
  )
})

test("display / bvod / audio / skipped channels resolve as specified", () => {
  assert.equal(
    resolveBenchmark({ channel: "prog_display", publisher: "Taboola", platform: "native" }).key,
    "display-taboola",
  )
  assert.equal(
    resolveBenchmark({ channel: "prog_display", publisher: "DV360", platform: "" }).key,
    "display",
  )
  assert.equal(resolveBenchmark({ channel: "digi_display", publisher: "", platform: "" }).key, "display")
  assert.equal(resolveBenchmark({ channel: "digi_bvod", publisher: "Seven", platform: "" }).key, "bvod")
  assert.equal(resolveBenchmark({ channel: "prog_bvod", publisher: "Nine", platform: "" }).key, "bvod")
  assert.equal(resolveBenchmark({ channel: "digi_audio", publisher: "", platform: "" }).key, "audio")
  assert.equal(resolveBenchmark({ channel: "ooh", publisher: "JCDecaux", platform: "" }), null)
  assert.equal(resolveBenchmark({ channel: "television", publisher: "", platform: "" }), null)
  assert.equal(resolveBenchmark({ channel: "production", publisher: "", platform: "" }), null)
})

test("search industry map uses the doc table; unknown client falls back to 6.6% / 8.2%", () => {
  assert.deepEqual(resolveSearchIndustry("BIC"), { ctr: 0.0828, conversion_rate: 0.0401 })
  assert.deepEqual(resolveSearchIndustry("Glendale Community College"), {
    ctr: 0.0756,
    conversion_rate: 0.1314,
  })
  assert.deepEqual(resolveSearchIndustry("Sinch"), { ctr: 0.061, conversion_rate: 0.0485 })
  assert.deepEqual(resolveSearchIndustry("Totally New Co"), { ctr: 0.066, conversion_rate: 0.082 })
})

test("stores rates as fractions and frequency as a number; never writes cpv", () => {
  const meta = resolveBenchmark({ channel: "social", publisher: "meta", platform: "ig" })
  assert.equal(meta.values.ctr, 0.011)
  assert.notEqual(meta.values.ctr, 1.1)
  assert.equal(meta.values.conversion_rate, 0.005)
  assert.equal("cpv" in meta.values, false)
  const tiktok = resolveBenchmark({ channel: "social", publisher: "tiktok", platform: "" })
  assert.equal(tiktok.values.conversion_rate, 0.005)
  assert.equal("cpv" in tiktok.values, false)
  const cf = resolveBenchmark({
    channel: "prog_video",
    publisher: "",
    platform: "channel factory",
  })
  assert.equal(cf.values.vtr, 0.75)
  assert.equal(cf.values.frequency, 3)
  assert.equal("cpv" in cf.values, false)
  const audio = resolveBenchmark({ channel: "prog_audio", publisher: "", platform: "" })
  assert.equal(audio.values.ctr, null)
  assert.equal(audio.values.frequency, 3)
})

test("parseArgs accepts repeatable --client, --all and --apply", () => {
  assert.deepEqual(parseArgs(["--client", "BIC", "--client", "Sinch"]), {
    clients: ["BIC", "Sinch"],
    all: false,
    apply: false,
  })
  assert.deepEqual(parseArgs(["--all", "--apply"]), {
    clients: [],
    all: true,
    apply: true,
  })
})

test("dry-run writes nothing", async () => {
  const writes = []
  const lines = [
    {
      mp_client_name: "BIC",
      mba_number: "BICAU002",
      campaign_name: "Camp",
      version_number: 28,
      line_item_id: "bicau002sm1",
      channel: "social",
      publisher: "Meta",
      platform: "facebook",
      bid_strategy: "cpm",
      kpi_id: null,
      ctr: null,
      conversion_rate: null,
      vtr: null,
      frequency: null,
    },
  ]
  const result = await runBackfill({
    apply: false,
    all: true,
    clients: [],
    loadLines: async () => lines,
    applyClient: async () => {
      writes.push("applied")
      return []
    },
  })
  assert.equal(writes.length, 0)
  assert.equal(result.planned.length, 1)
  assert.equal(result.planned[0].kind, "insert")
  assert.equal(result.applied, false)
})

test("duplicate campaign_kpi rows for a line fail closed", async () => {
  const key = "bicau002|28|bicau002sm1"
  assert.deepEqual(
    duplicateCampaignKpiKeys([
      {
        mba_number: "BICAU002",
        version_number: 28,
        line_item_id: "bicau002sm1",
        kpi_id: 11,
      },
      {
        mba_number: "bicau002",
        version_number: 28,
        line_item_id: "BICAU002SM1",
        kpi_id: 22,
      },
    ]),
    [key],
  )

  await assert.rejects(
    () =>
      runBackfill({
        apply: false,
        all: true,
        clients: [],
        loadLines: async () => [
          {
            mp_client_name: "BIC",
            mba_number: "BICAU002",
            campaign_name: "Camp",
            version_number: 28,
            line_item_id: "bicau002sm1",
            channel: "social",
            publisher: "Meta",
            platform: "facebook",
            bid_strategy: "cpm",
            kpi_id: 11,
            ctr: 0,
            conversion_rate: 0,
            vtr: 0,
            frequency: 0,
          },
          {
            mp_client_name: "BIC",
            mba_number: "BICAU002",
            campaign_name: "Camp",
            version_number: 28,
            line_item_id: "bicau002sm1",
            channel: "social",
            publisher: "Meta",
            platform: "facebook",
            bid_strategy: "cpm",
            kpi_id: 22,
            ctr: 0,
            conversion_rate: 0,
            vtr: 0,
            frequency: 0,
          },
        ],
        applyClient: async () => [],
      }),
    (err) => {
      assert.match(
        err instanceof Error ? err.message : String(err),
        /campaign_kpi has duplicate rows for bicau002\|28\|bicau002sm1/,
      )
      return true
    },
  )
})
