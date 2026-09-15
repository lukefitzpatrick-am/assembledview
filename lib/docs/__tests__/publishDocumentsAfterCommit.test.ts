/**
 * Publish-path document generate is best-effort after commit (option b).
 * A render failure is named on the save response; it never rolls back the version.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  DOC_SKIP_REASON,
  applyPublishDocumentsStep,
} from "../saveDocSteps"
import {
  runPublishDocumentsBestEffort,
  summarizeRegenerateForSaveModal,
} from "../publishDocumentsAfterCommit"
import { POSTGRES_SAVE_DOC_STEP } from "@/lib/mediaplan/buildPostgresSavePayload"

describe("summarizeRegenerateForSaveModal", () => {
  it("ok when every kind is written, skipped, or not_applicable", () => {
    const summary = summarizeRegenerateForSaveModal({
      status: "ok",
      results: [
        { kind: "mba_pdf", status: "written" },
        { kind: "media_plan", status: "written" },
        { kind: "aa_media_plan", status: "not_applicable" },
      ],
    })
    assert.equal(summary.status, "ok")
    assert.equal(summary.error, undefined)
  })

  it("error when any kind failed, and names kind + message", () => {
    const summary = summarizeRegenerateForSaveModal({
      status: "ok",
      results: [
        { kind: "mba_pdf", status: "written" },
        { kind: "media_plan", status: "error", error: "workbook boom" },
        { kind: "aa_media_plan", status: "not_applicable" },
      ],
    })
    assert.equal(summary.status, "error")
    assert.match(summary.error ?? "", /media_plan: workbook boom/)
  })

  it("error on not_published / not_found (publish already committed)", () => {
    assert.equal(
      summarizeRegenerateForSaveModal({
        status: "not_published",
        code: "NOT_PUBLISHED",
      }).status,
      "error",
    )
    assert.equal(
      summarizeRegenerateForSaveModal({ status: "not_found" }).status,
      "error",
    )
  })
})

describe("runPublishDocumentsBestEffort", () => {
  it("skips when the save did not publish", async () => {
    let called = 0
    const result = await runPublishDocumentsBestEffort({
      published: false,
      versionId: 1,
      regenerate: async () => {
        called++
        return { status: "ok", results: [] }
      },
    })
    assert.equal(called, 0)
    assert.equal(result.status, "skipped")
    assert.equal(result.error, DOC_SKIP_REASON)
  })

  it("does not throw when regenerate throws; names the error", async () => {
    const result = await runPublishDocumentsBestEffort({
      published: true,
      versionId: 99,
      regenerate: async () => {
        throw new Error("blob put failed")
      },
    })
    assert.equal(result.status, "error")
    assert.equal(result.error, "blob put failed")
  })

  it("passes versionId through to regenerate", async () => {
    let seen = 0
    const result = await runPublishDocumentsBestEffort({
      published: true,
      versionId: 42,
      regenerate: async (input) => {
        seen = input.versionId
        return {
          status: "ok",
          results: [{ kind: "mba_pdf", status: "written" }],
        }
      },
    })
    assert.equal(seen, 42)
    assert.equal(result.status, "ok")
  })
})

describe("applyPublishDocumentsStep", () => {
  it("missing payload is a visible error, not a silent skip", () => {
    const calls: Array<[string, string, string | undefined]> = []
    applyPublishDocumentsStep((name, status, error) => {
      calls.push([name, status, error])
    }, undefined)
    assert.deepEqual(calls, [
      [POSTGRES_SAVE_DOC_STEP, "error", "Document step did not run"],
    ])
  })

  it("maps ok / skipped / error onto the modal step", () => {
    const calls: Array<[string, string, string | undefined]> = []
    const update = (name: string, status: string, error?: string) => {
      calls.push([name, status, error])
    }
    applyPublishDocumentsStep(update, { status: "ok" })
    applyPublishDocumentsStep(update, {
      status: "skipped",
      error: DOC_SKIP_REASON,
    })
    applyPublishDocumentsStep(update, {
      status: "error",
      error: "mba_pdf: boom",
    })
    assert.deepEqual(calls, [
      [POSTGRES_SAVE_DOC_STEP, "success", undefined],
      [POSTGRES_SAVE_DOC_STEP, "skipped", DOC_SKIP_REASON],
      [POSTGRES_SAVE_DOC_STEP, "error", "mba_pdf: boom"],
    ])
  })
})

describe("publish documents wired after commit, not inside the txn", () => {
  const savePlanSrc = readFileSync(
    join(process.cwd(), "lib/data/savePlan.ts"),
    "utf8",
  )
  const routeSrc = readFileSync(
    join(process.cwd(), "app/api/plans/save/route.ts"),
    "utf8",
  )

  it("savePlanVersion runs generate after the txn, beside markRunItemsStaleOnPublish", () => {
    const afterTxn = savePlanSrc.split("if (result.published)")[1] ?? ""
    assert.match(afterTxn, /markRunItemsStaleOnPublish/)
    assert.match(afterTxn, /runPublishDocumentsBestEffort/)
    assert.doesNotMatch(
      savePlanSrc.split("await db.transaction")[1]?.split("return {")[0] ?? "",
      /runPublishDocumentsBestEffort/,
    )
  })

  it("plans/save forwards documents on the 200 without failing the save", () => {
    assert.match(routeSrc, /documents:\s*result\.documents/)
  })
})
