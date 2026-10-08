import assert from "node:assert/strict"
import test from "node:test"

import {
  downloadStoredPlanFile,
  NotApprovedError,
  NotSavedError,
} from "@/lib/docs/downloadStoredPlanFile"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

test("downloadStoredPlanFile returns the blob and the stored file name", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.equal(String(input), "/api/mediaplans/42/download?kind=media_plan")
    return new Response(new Blob(["xlsx"]), {
      status: 200,
      headers: {
        "Content-Disposition":
          "attachment; filename=\"Glendale_MediaPlan_v6.xlsx\"; filename*=UTF-8''Glendale_MediaPlan_v6.xlsx",
      },
    })
  }) as typeof fetch
  try {
    const result = await downloadStoredPlanFile({ versionId: 42, kind: "media_plan" })
    assert.equal(result.fileName, "Glendale_MediaPlan_v6.xlsx")
    assert.equal(await result.blob.text(), "xlsx")
  } finally {
    globalThis.fetch = original
  }
})

test("downloadStoredPlanFile uses the quoted stored name when filename* is absent", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    return new Response(new Blob(["pdf"]), {
      status: 200,
      headers: {
        "Content-Disposition": 'attachment; filename="Glendale_MBA_v6.pdf"',
      },
    })
  }) as typeof fetch
  try {
    const result = await downloadStoredPlanFile({ versionId: 7, kind: "mba_pdf" })
    assert.equal(result.fileName, "Glendale_MBA_v6.pdf")
  } finally {
    globalThis.fetch = original
  }
})

test("downloadStoredPlanFile throws NotApprovedError on 422", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    jsonResponse(422, {
      error: "Document download requires a published version (published_at set)",
      code: "NOT_APPROVED",
    })) as typeof fetch
  try {
    await assert.rejects(
      () => downloadStoredPlanFile({ versionId: 3, kind: "aa_media_plan" }),
      (err: unknown) => {
        assert.ok(err instanceof NotApprovedError)
        assert.equal(err.code, "NOT_APPROVED")
        assert.match(err.message, /published version/)
        return true
      },
    )
  } finally {
    globalThis.fetch = original
  }
})

test("downloadStoredPlanFile throws NotSavedError on 404 NOT_SAVED", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    jsonResponse(404, {
      error: "No stored document for this version",
      code: "NOT_SAVED",
    })) as typeof fetch
  try {
    await assert.rejects(
      () => downloadStoredPlanFile({ versionId: 3, kind: "media_plan" }),
      (err: unknown) => {
        assert.ok(err instanceof NotSavedError)
        assert.equal(err.status, 404)
        return true
      },
    )
  } finally {
    globalThis.fetch = original
  }
})
