/**
 * Human Save completes a staged ingest after savePlanVersion.
 * Version is already committed — this hook never rolls it back.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { completeStagedIngestAfterSave } from "@/lib/mediaplans/ingest/completeStagedIngestAfterSave"
import type { IngestPanelRow } from "@/lib/mediaplans/ingest/stampProposalForSave"
import type {
  IngestRunInput,
  IngestRunRecord,
} from "@/lib/mediaplans/ingest/ingestRuns"
import type { StagedIngest } from "@/lib/mediaplans/ingest/ingestStageStore"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"

const STAGE = "11111111-1111-4111-8111-111111111111"
const MBA = "qmsround01"

function oohProposal(n: number): IngestProposal {
  return {
    publisher_name: "QMS",
    media_type: "ooh",
    sheet_name: "Paid",
    line_items: Array.from({ length: n }, (_, i) => ({
      grouping: {},
      panels: [
        {
          descriptors: {},
          raw_unmapped: {},
          source_publisher: "QMS",
          source_row_ref: `Paid!r${i + 2}`,
          flights: [],
          grid_period_count: 0,
        },
      ],
      bursts: [],
    })),
    reconciliation: {
      line_item_count: n,
      panel_count: n,
      burst_count: 0,
      total_media_amount: 0,
      file_stated_total: 0,
      delta: 0,
      delta_pct: 0,
      accept_ok: true,
      block_reason: null,
      warnings: [],
      charges_detected_total: 0,
    },
  }
}

function review(proposal: IngestProposal | null): IngestReviewPackage {
  return {
    detected_publisher: "QMS",
    publisher_confidence: 0.9,
    match_reasons: ["stub"],
    profile: null,
    sheet_name: "Paid",
    column_mapping: [],
    proposal,
    ignored: {
      sheets_skipped: [],
      rows_unparsed: 0,
      rows_unparsed_labels: [],
      columns_unmapped: [],
      spoken: [],
    },
    ava_mapping_proposals: [],
    ava_call_count: 0,
    unmapped_column_samples: [],
    template_coverage: null,
    detected_media_type: "ooh",
    media_type_status: "detected",
    needs_catalogue_choice: false,
    source_file_name: "qms.xlsx",
    sheets: [],
  }
}

function staged(over: Partial<StagedIngest> = {}): StagedIngest {
  return {
    stageId: STAGE,
    review: review(oohProposal(1)),
    fileName: "qms.xlsx",
    uploadedBy: "luke@assembledmedia.com.au",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    retainedAt: null,
    masterId: null,
    acceptedVersionId: null,
    ...over,
  }
}

function savedOne() {
  return [
    {
      lineItemId: "qmsround01OH4",
      channel: "ooh" as const,
      ingestSourceRowRefs: ["Paid!r2"],
    },
  ]
}

test("save with no ingestStageId writes nothing", async () => {
  let getCalls = 0
  const result = await completeStagedIngestAfterSave(
    {
      mbaNumber: MBA,
      masterId: 1,
      acceptedVersionId: 99,
      savedLineItems: savedOne(),
      uploadedBy: "luke@assembledmedia.com.au",
    },
    {
      getStage: async () => {
        getCalls += 1
        return staged()
      },
      insertPanels: async () => {
        throw new Error("insert must not run")
      },
      recordRun: async () => {
        throw new Error("record must not run")
      },
      retainStage: async () => {
        throw new Error("retain must not run")
      },
    },
  )
  assert.equal(getCalls, 0)
  assert.equal(result.ingestStageRetained, false)
  assert.equal(result.ingestPanelError, undefined)
})

test("stage-missing save succeeds and writes nothing", async () => {
  const result = await completeStagedIngestAfterSave(
    {
      ingestStageId: STAGE,
      mbaNumber: MBA,
      masterId: 1,
      acceptedVersionId: 99,
      savedLineItems: savedOne(),
      uploadedBy: "luke@assembledmedia.com.au",
    },
    {
      getStage: async () => null,
      insertPanels: async () => {
        throw new Error("insert must not run")
      },
      recordRun: async () => {
        throw new Error("record must not run")
      },
      retainStage: async () => {
        throw new Error("retain must not run")
      },
    },
  )
  assert.equal(result.ingestStageRetained, false)
  assert.equal(result.ingestPanelError, undefined)
})

test("idempotency: already-retained stage writes nothing on a second save", async () => {
  let inserts = 0
  let runs = 0
  let retains = 0
  const result = await completeStagedIngestAfterSave(
    {
      ingestStageId: STAGE,
      mbaNumber: MBA,
      masterId: 1,
      acceptedVersionId: 99,
      savedLineItems: savedOne(),
      uploadedBy: "luke@assembledmedia.com.au",
    },
    {
      getStage: async () =>
        staged({ retainedAt: "2026-01-01T12:00:00.000Z" }),
      insertPanels: async () => {
        inserts += 1
        return 0
      },
      recordRun: async (input: IngestRunInput): Promise<IngestRunRecord> => {
        runs += 1
        return { ...input, id: 1, createdAt: "2026-01-01T00:00:00.000Z" }
      },
      retainStage: async () => {
        retains += 1
      },
    },
  )
  assert.equal(inserts, 0)
  assert.equal(runs, 0)
  assert.equal(retains, 0)
  assert.equal(result.ingestStageRetained, true)
  assert.equal(result.ingestPanelError, undefined)
})

test("happy path: panels keyed to saved ids, then run + retain", async () => {
  const inserted: IngestPanelRow[][] = []
  const runs: IngestRunInput[] = []
  const retains: Array<{
    stageId: string
    masterId: number
    acceptedVersionId: number
  }> = []
  const result = await completeStagedIngestAfterSave(
    {
      ingestStageId: STAGE,
      mbaNumber: MBA,
      masterId: 7,
      acceptedVersionId: 42,
      savedLineItems: savedOne(),
      uploadedBy: "luke@assembledmedia.com.au",
    },
    {
      getStage: async () => staged(),
      insertPanels: async (rows) => {
        inserted.push(rows)
        return rows.length
      },
      recordRun: async (input) => {
        runs.push(input)
        return { ...input, id: 1, createdAt: "2026-01-01T00:00:00.000Z" }
      },
      retainStage: async (args) => {
        retains.push(args)
      },
    },
  )
  assert.equal(result.ingestStageRetained, true)
  assert.equal(result.ingestPanelError, undefined)
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0]?.[0]?.lineItemId, "qmsround01OH4")
  assert.ok(!inserted[0]?.[0]?.lineItemId.includes("ingestform"))
  assert.equal(runs.length, 1)
  assert.equal(runs[0]?.outcome, "accepted")
  assert.equal(runs[0]?.acceptedVersionId, 42)
  assert.deepEqual(retains, [
    { stageId: STAGE, masterId: 7, acceptedVersionId: 42 },
  ])
})

test("panel-insert failure surfaces in the result and does not retain or record", async () => {
  let runs = 0
  let retains = 0
  const result = await completeStagedIngestAfterSave(
    {
      ingestStageId: STAGE,
      mbaNumber: MBA,
      masterId: 1,
      acceptedVersionId: 99,
      savedLineItems: savedOne(),
      uploadedBy: "luke@assembledmedia.com.au",
    },
    {
      getStage: async () => staged(),
      insertPanels: async () => {
        throw new Error("unique_violation")
      },
      recordRun: async (input) => {
        runs += 1
        return { ...input, id: 1, createdAt: "2026-01-01T00:00:00.000Z" }
      },
      retainStage: async () => {
        retains += 1
      },
    },
  )
  assert.equal(result.ingestStageRetained, false)
  assert.match(result.ingestPanelError ?? "", /unique_violation/)
  assert.match(
    result.ingestPanelError ?? "",
    /Plan saved, but panels were not written/,
  )
  assert.equal(runs, 0)
  assert.equal(retains, 0)
})

test("ingest_runs failure is fail-open: still retains", async () => {
  const retains: number[] = []
  const result = await completeStagedIngestAfterSave(
    {
      ingestStageId: STAGE,
      mbaNumber: MBA,
      masterId: 1,
      acceptedVersionId: 99,
      savedLineItems: savedOne(),
      uploadedBy: "luke@assembledmedia.com.au",
    },
    {
      getStage: async () => staged(),
      insertPanels: async (rows) => rows.length,
      recordRun: async () => {
        throw new Error("ingest_runs down")
      },
      retainStage: async () => {
        retains.push(1)
      },
    },
  )
  assert.equal(result.ingestStageRetained, true)
  assert.equal(result.ingestPanelError, undefined)
  assert.equal(retains.length, 1)
})

test("empty remap when saved lines carry no ingest identity", async () => {
  let inserts = 0
  const result = await completeStagedIngestAfterSave(
    {
      ingestStageId: STAGE,
      mbaNumber: MBA,
      masterId: 1,
      acceptedVersionId: 99,
      savedLineItems: [{ lineItemId: "qmsround01OH4", channel: "ooh" }],
      uploadedBy: "luke@assembledmedia.com.au",
    },
    {
      getStage: async () => staged(),
      insertPanels: async () => {
        inserts += 1
        return 0
      },
      recordRun: async () => {
        throw new Error("record must not run")
      },
      retainStage: async () => {
        throw new Error("retain must not run")
      },
    },
  )
  assert.equal(inserts, 0)
  assert.equal(result.ingestStageRetained, false)
  assert.match(
    result.ingestPanelError ?? "",
    /could not match ingest panels to saved line item ids/,
  )
})

test("mismatch between written panels and surviving ingest rows surfaces like insert failure", async () => {
  let inserts = 0
  let runs = 0
  let retains = 0
  const result = await completeStagedIngestAfterSave(
    {
      ingestStageId: STAGE,
      mbaNumber: MBA,
      masterId: 1,
      acceptedVersionId: 99,
      savedLineItems: savedOne(),
      uploadedBy: "luke@assembledmedia.com.au",
    },
    {
      getStage: async () => staged(),
      keyPanels: () => ({
        panels: [
          {
            lineItemId: "qmsround01OH4",
            mbaNumber: MBA,
            buyGranularity: "panel",
            latitude: null,
            longitude: null,
            publisherFormatName: null,
            state: null,
            siteNumber: null,
            addressOrPackDetails: null,
            suburb: null,
            postcode: null,
            direction: null,
            geography: null,
            format: null,
            size: null,
            orientation: null,
            digitalSpec: null,
            illumination: null,
            digitalOperatingHours: null,
            rotationSeconds: null,
            advertiserShare: null,
            panelName: null,
            villageName: null,
            panelWeight: null,
            sourcePublisher: "QMS",
            sourceRowRef: "Paid!r2",
            rawExtras: {},
            flights: [],
          },
        ],
        sourcePanelCount: 1,
        survivingIngestPanelCount: 2,
      }),
      insertPanels: async () => {
        inserts += 1
        return 0
      },
      recordRun: async () => {
        runs += 1
        throw new Error("record must not run")
      },
      retainStage: async () => {
        retains += 1
      },
    },
  )
  assert.equal(inserts, 0)
  assert.equal(runs, 0)
  assert.equal(retains, 0)
  assert.equal(result.ingestStageRetained, false)
  assert.match(result.ingestPanelError ?? "", /ingest panel count mismatch/)
  assert.match(
    result.ingestPanelError ?? "",
    /Plan saved, but panels were not written/,
  )
})
