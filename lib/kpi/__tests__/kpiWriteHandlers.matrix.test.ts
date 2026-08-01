/**
 * C-18 matrix: campaign/client/publisher × POST/PATCH/DELETE (+ campaign sync).
 * Valid admin-shaped payloads succeed with mocked upstream; bad input → named 400.
 */

import assert from "node:assert/strict"
import test from "node:test"
import {
  KPI_ERROR,
  handleCampaignKpiDelete,
  handleCampaignKpiPatch,
  handleCampaignKpiPost,
  handleCampaignKpiSync,
  handleClientKpiDelete,
  handleClientKpiPatch,
  handleClientKpiPost,
  handlePublisherKpiDelete,
  handlePublisherKpiPatch,
  handlePublisherKpiPost,
  parseKpiJsonBody,
  type KpiHandlerResult,
} from "../kpiWriteHandlers.js"
import type {
  CampaignKPI,
  CampaignKpiInput,
  ClientKpi,
  ClientKpiInput,
  PublisherKpi,
  PublisherKpiInput,
} from "../types.js"

function errCode(result: KpiHandlerResult): string | undefined {
  const body = result.body as { code?: string }
  return body.code
}

const publisherCreateValid: PublisherKpiInput = {
  publisher: "pub_1",
  media_type: "digitalDisplay",
  bid_strategy: "cpm",
  ctr: 0.0045,
  cpv: null,
  conversion_rate: null,
  vtr: null,
  frequency: null,
}

const clientCreateValid: ClientKpiInput = {
  mp_client_name: "Acme",
  publisher_name: "Pub Co",
  media_type: "digitalDisplay",
  bid_strategy: "cpm",
  ctr: 0.01,
  cpv: null,
  conversion_rate: null,
  vtr: null,
  frequency: null,
}

const campaignItemValid: CampaignKpiInput = {
  mp_client_name: "Acme",
  mba_number: "MBA-1",
  version_number: 1,
  campaign_name: "Spring",
  media_type: "digitalDisplay",
  publisher: "pub_1",
  bid_strategy: "cpm",
  line_item_id: "MBA-1_v1_li_1",
  ctr: 0.0045,
  cpv: null,
  conversion_rate: null,
  vtr: null,
  frequency: null,
}

function fakePublisher(id: number, input: PublisherKpiInput): PublisherKpi {
  return { id, created_at: 1, ...input }
}

function fakeClient(id: number, input: ClientKpiInput): ClientKpi {
  return { id, created_at: 1, ...input }
}

function fakeCampaign(id: number, input: CampaignKpiInput): CampaignKPI {
  return { id, created_at: 1, ...input }
}

// --- shared parse helpers ---

test("parseKpiJsonBody: invalid JSON → 400 KPI_INVALID_JSON", () => {
  const result = parseKpiJsonBody("{not json")
  assert.ok(!("ok" in result))
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.INVALID_JSON)
})

test("parseKpiJsonBody: valid JSON ok", () => {
  const result = parseKpiJsonBody('{"a":1}')
  assert.ok("ok" in result && result.ok)
  assert.deepEqual(result.data, { a: 1 })
})

// --- publisher matrix ---

test("publisher POST: valid decimal payload → 201", async () => {
  const result = await handlePublisherKpiPost(publisherCreateValid, {
    create: async (input) => fakePublisher(10, input),
  })
  assert.equal(result.status, 201)
  assert.equal((result.body as PublisherKpi).ctr, 0.0045)
})

test("publisher POST: percent-points (>1) → 400 KPI_VALIDATION_FAILED", async () => {
  const result = await handlePublisherKpiPost(
    { ...publisherCreateValid, ctr: 5 },
    { create: async () => fakePublisher(1, publisherCreateValid) },
  )
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.VALIDATION_FAILED)
})

test("publisher POST: missing publisher → 400 KPI_VALIDATION_FAILED", async () => {
  const result = await handlePublisherKpiPost(
    { ...publisherCreateValid, publisher: "" },
    { create: async () => fakePublisher(1, publisherCreateValid) },
  )
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.VALIDATION_FAILED)
})

test("publisher POST: upstream null → 502 KPI_UPSTREAM_FAILED", async () => {
  const result = await handlePublisherKpiPost(publisherCreateValid, {
    create: async () => null,
  })
  assert.equal(result.status, 502)
  assert.equal(errCode(result), KPI_ERROR.UPSTREAM_FAILED)
})

test("publisher PATCH: valid → 200", async () => {
  const result = await handlePublisherKpiPatch(
    { id: 10, ctr: 0.02 },
    {
      update: async (id, input) =>
        fakePublisher(id, { ...publisherCreateValid, ...input }),
    },
  )
  assert.equal(result.status, 200)
  assert.equal((result.body as PublisherKpi).ctr, 0.02)
})

test("publisher PATCH: bad id → 400 KPI_VALIDATION_FAILED", async () => {
  const result = await handlePublisherKpiPatch(
    { id: "abc", ctr: 0.02 },
    { update: async () => fakePublisher(1, publisherCreateValid) },
  )
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.VALIDATION_FAILED)
})

test("publisher DELETE: valid → 200", async () => {
  const result = await handlePublisherKpiDelete("42", {
    delete: async () => true,
  })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { success: true })
})

test("publisher DELETE: non-numeric id → 400 KPI_INVALID_ID", async () => {
  const result = await handlePublisherKpiDelete("abc", {
    delete: async () => true,
  })
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.INVALID_ID)
})

test("publisher DELETE: missing id → 400 KPI_INVALID_ID", async () => {
  const result = await handlePublisherKpiDelete(null, {
    delete: async () => true,
  })
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.INVALID_ID)
})

test("publisher DELETE: upstream false → 502 KPI_UPSTREAM_FAILED", async () => {
  const result = await handlePublisherKpiDelete("9", {
    delete: async () => false,
  })
  assert.equal(result.status, 502)
  assert.equal(errCode(result), KPI_ERROR.UPSTREAM_FAILED)
})

// --- client matrix ---

test("client POST: valid decimal payload → 201", async () => {
  const result = await handleClientKpiPost(clientCreateValid, {
    create: async (input) => fakeClient(11, input),
  })
  assert.equal(result.status, 201)
  assert.equal((result.body as ClientKpi).ctr, 0.01)
})

test("client POST: unset metrics default null (not 0)", async () => {
  const result = await handleClientKpiPost(
    {
      mp_client_name: "Acme",
      publisher_name: "Pub",
      media_type: "search",
    },
    {
      create: async (input) => {
        assert.equal(input.ctr, null)
        assert.equal(input.cpv, null)
        return fakeClient(1, input)
      },
    },
  )
  assert.equal(result.status, 201)
})

test("client POST: percent-points (>1) → 400 KPI_VALIDATION_FAILED", async () => {
  const result = await handleClientKpiPost(
    { ...clientCreateValid, ctr: 45 },
    { create: async () => fakeClient(1, clientCreateValid) },
  )
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.VALIDATION_FAILED)
})

test("client PATCH: valid → 200", async () => {
  const result = await handleClientKpiPatch(
    { id: 11, vtr: 0.5 },
    {
      update: async (id, input) =>
        fakeClient(id, { ...clientCreateValid, ...input }),
    },
  )
  assert.equal(result.status, 200)
})

test("client PATCH: id 0 → 400 KPI_VALIDATION_FAILED", async () => {
  const result = await handleClientKpiPatch(
    { id: 0, ctr: 0.01 },
    { update: async () => fakeClient(1, clientCreateValid) },
  )
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.VALIDATION_FAILED)
})

test("client DELETE: valid → 200", async () => {
  const result = await handleClientKpiDelete("7", { delete: async () => true })
  assert.equal(result.status, 200)
})

test("client DELETE: NaN id → 400 KPI_INVALID_ID", async () => {
  const result = await handleClientKpiDelete("not-an-id", {
    delete: async () => true,
  })
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.INVALID_ID)
})

// --- campaign matrix ---

test("campaign POST: valid array → 201", async () => {
  const result = await handleCampaignKpiPost([campaignItemValid], {
    create: async (inputs) => inputs.map((r, i) => fakeCampaign(i + 1, r)),
  })
  assert.equal(result.status, 201)
  assert.ok(Array.isArray(result.body))
  assert.equal((result.body as CampaignKPI[])[0]!.ctr, 0.0045)
})

test("campaign POST: percent-points → 400 KPI_VALIDATION_FAILED", async () => {
  const result = await handleCampaignKpiPost(
    [{ ...campaignItemValid, ctr: 8 }],
    { create: async () => [] },
  )
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.VALIDATION_FAILED)
})

test("campaign POST: missing line_item_id → 400 KPI_VALIDATION_FAILED", async () => {
  const { line_item_id: _, ...rest } = campaignItemValid
  const result = await handleCampaignKpiPost([rest], {
    create: async () => [],
  })
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.VALIDATION_FAILED)
})

test("campaign POST: create throw → 502 KPI_UPSTREAM_FAILED", async () => {
  const result = await handleCampaignKpiPost([campaignItemValid], {
    create: async () => {
      throw new Error("createCampaignKpis: row 0 failed: status code 500")
    },
  })
  assert.equal(result.status, 502)
  assert.equal(errCode(result), KPI_ERROR.UPSTREAM_FAILED)
})

test("campaign PATCH: valid → 200", async () => {
  const result = await handleCampaignKpiPatch(
    { id: 3, ctr: 0.1 },
    {
      update: async (id, input) =>
        fakeCampaign(id, { ...campaignItemValid, ...input }),
    },
  )
  assert.equal(result.status, 200)
})

test("campaign PATCH: upstream null → 502 KPI_UPSTREAM_FAILED", async () => {
  const result = await handleCampaignKpiPatch(
    { id: 3, ctr: 0.1 },
    { update: async () => null },
  )
  assert.equal(result.status, 502)
  assert.equal(errCode(result), KPI_ERROR.UPSTREAM_FAILED)
})

test("campaign DELETE: valid → 200", async () => {
  const result = await handleCampaignKpiDelete("5", {
    delete: async () => true,
  })
  assert.equal(result.status, 200)
})

test("campaign DELETE: empty id → 400 KPI_INVALID_ID", async () => {
  const result = await handleCampaignKpiDelete("  ", {
    delete: async () => true,
  })
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.INVALID_ID)
})

test("campaign sync: valid → 200", async () => {
  const result = await handleCampaignKpiSync([campaignItemValid], {
    sync: async (inputs) => inputs.map((r, i) => fakeCampaign(i + 1, r)),
  })
  assert.equal(result.status, 200)
  assert.ok(Array.isArray(result.body))
})

test("campaign sync: percent-points → 400 KPI_VALIDATION_FAILED", async () => {
  const result = await handleCampaignKpiSync(
    [{ ...campaignItemValid, conversion_rate: 12 }],
    { sync: async () => [] },
  )
  assert.equal(result.status, 400)
  assert.equal(errCode(result), KPI_ERROR.VALIDATION_FAILED)
})

test("campaign sync: upstream throw → 502 KPI_UPSTREAM_FAILED", async () => {
  const result = await handleCampaignKpiSync([campaignItemValid], {
    sync: async () => {
      throw new Error("syncCampaignKpis: row 0 (line_item_id=x) failed: boom")
    },
  })
  assert.equal(result.status, 502)
  assert.equal(errCode(result), KPI_ERROR.UPSTREAM_FAILED)
})
