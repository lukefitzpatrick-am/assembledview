/**
 * Guard: ingestStageId must survive assemble → Zod bodySchema → the save route.
 * Zod strips unknown keys silently — the C-21 fee-wipe class of bug.
 * This test is written against current code first; a green test written after
 * the schema change would not prove the trap exists.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { assemblePlansSaveRequestBody } from "@/lib/mediaplan/buildPostgresSavePayload"
import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"

const STAGE = "11111111-1111-4111-8111-111111111111"

test("ingestStageId survives assemblePlansSaveRequestBody → bodySchema", () => {
  const assembled = assemblePlansSaveRequestBody(
    {
      masterId: 1,
      mbaNumber: "qmsround01",
      versionNumber: 1,
      mode: "draft",
      lineItems: [],
      ingestStageId: STAGE,
    } as Parameters<typeof assemblePlansSaveRequestBody>[0] & {
      ingestStageId: string
    },
    { feeLoading: {} },
  )
  assert.equal(
    (assembled as { ingestStageId?: string }).ingestStageId,
    STAGE,
    "assembler must pass ingestStageId through",
  )
  const parsed = plansSaveBodySchema.safeParse(assembled)
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(
    parsed.data.ingestStageId,
    STAGE,
    "Zod bodySchema must not strip ingestStageId (C-21 class trap)",
  )
})

test("SV-1: tipVersionIdAtLoad survives assemblePlansSaveRequestBody → bodySchema", () => {
  const assembled = assemblePlansSaveRequestBody(
    {
      masterId: 1,
      mbaNumber: "sv1fork01",
      versionNumber: 6,
      mode: "publish",
      lineItems: [],
      baseVersionId: 30,
      tipVersionIdAtLoad: 50,
    } as Parameters<typeof assemblePlansSaveRequestBody>[0],
    { feeLoading: {} },
  )
  assert.equal(
    (assembled as { tipVersionIdAtLoad?: number | null }).tipVersionIdAtLoad,
    50,
    "assembler must pass tipVersionIdAtLoad through",
  )
  const parsed = plansSaveBodySchema.safeParse(assembled)
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.tipVersionIdAtLoad, 50)
  assert.equal(parsed.data.baseVersionId, 30)
})
