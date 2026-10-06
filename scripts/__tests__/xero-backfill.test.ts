import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyPublishedMbaRematch,
  createCallPacer,
  invoiceBackfillPath,
  PDF_BACKFILL_PENDING_SQL,
  pdfBackfillStepOutcome,
  pdfBackfillStillMissingQuery,
  pdfBackfillUrlMissing,
  persistBackfillPdfFile,
  resumeBackfillPage,
  runPdfBatches,
  walkPagedResource,
  XERO_BACKFILL_DAILY_CALL_BUDGET,
  XERO_BACKFILL_PDF_BATCH,
  XERO_BACKFILL_PDF_BATCH_PAUSE_MS,
  XERO_LIST_PAGE_SIZE,
} from "../xero-backfill"

function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks
  if (!chunks) return String(query)
  const parts: string[] = []
  const walk = (chunk: unknown) => {
    if (typeof chunk === "string") {
      parts.push(chunk)
      return
    }
    if (!chunk || typeof chunk !== "object") return
    if ("queryChunks" in chunk) {
      for (const nested of (chunk as { queryChunks: unknown[] }).queryChunks) walk(nested)
      return
    }
    if ("value" in chunk) {
      const value = (chunk as { value: unknown }).value
      if (Array.isArray(value)) parts.push(value.map((part) => String(part)).join(""))
      else if (typeof value === "string") parts.push(value)
    }
  }
  for (const chunk of chunks) walk(chunk)
  return parts.join("")
}

describe("page walker resumes from a saved page", () => {
  it("continues at the incomplete page and does not restart at 1", async () => {
    const fetches: number[] = []
    const first = await walkPagedResource({
      startPage: 1,
      maxAttempts: 3,
      fetchPage: async (page) => {
        fetches.push(page)
        if (page < 3) return { ok: true, items: [{ page }] }
        return { ok: false, items: [] }
      },
    })

    assert.equal(first.outcome, "incomplete")
    assert.equal(first.nextPage, 3)
    assert.equal(first.pagesFetched, 2)
    assert.deepEqual(
      fetches.filter((page) => page === 3),
      [3, 3, 3],
    )

    const savedPage = resumeBackfillPage({
      status: "incomplete",
      notes: { next_page: first.nextPage },
    })
    assert.equal(savedPage, 3)

    const secondFetches: number[] = []
    const second = await walkPagedResource({
      startPage: savedPage,
      maxAttempts: 3,
      fetchPage: async (page) => {
        secondFetches.push(page)
        if (page === 3) return { ok: true, items: [{ page }] }
        return { ok: true, items: [] }
      },
    })

    assert.equal(second.outcome, "success")
    assert.equal(second.nextPage, null)
    assert.equal(secondFetches[0], 3)
    assert.equal(secondFetches.includes(1), false)
  })

  it("requests the Xero max page size and does not send If-Modified-Since", () => {
    const path = invoiceBackfillPath(4, "2025-07-01")
    const url = new URL(`https://api.xero.com${path}`)
    assert.equal(url.searchParams.get("page"), "4")
    assert.equal(url.searchParams.get("pageSize"), String(XERO_LIST_PAGE_SIZE))
    assert.equal(XERO_LIST_PAGE_SIZE, 1000)
    assert.equal(url.searchParams.get("where"), "Date>=DateTime(2025,7,1)")
    assert.equal(path.toLowerCase().includes("modified"), false)
  })
})

describe("PDF backfill selector", () => {
  const xanoStub = {
    meta: {},
    mime: "",
    name: "",
    path: "",
    size: 0,
    type: "",
    access: "public",
  }

  it("includes null rows, Xano stubs with no url, and empty urls", () => {
    assert.equal(
      PDF_BACKFILL_PENDING_SQL,
      "pdf_file IS NULL OR pdf_file->>'url' IS NULL OR pdf_file->>'url' = ''",
    )
    assert.equal(pdfBackfillUrlMissing(null), true)
    assert.equal(pdfBackfillUrlMissing(xanoStub), true)
    assert.equal(pdfBackfillUrlMissing({ url: "" }), true)
    assert.equal(pdfBackfillUrlMissing({ url: null }), true)
    assert.equal(
      pdfBackfillUrlMissing({
        url: "https://blob.example/xero-invoices/abc/INV.pdf",
        pathname: "xero-invoices/abc/INV.pdf",
      }),
      false,
    )
    assert.equal(XERO_BACKFILL_DAILY_CALL_BUDGET, 4000)
    assert.equal(XERO_BACKFILL_PDF_BATCH, 10)
    assert.equal(XERO_BACKFILL_PDF_BATCH_PAUSE_MS, 2 * 60 * 1000)
  })
})

describe("PDF batcher stops at the daily budget", () => {
  it("stops once the day's calls reach 4000 and says when to rerun", async () => {
    const fetched: number[] = []
    const sleeps: number[] = []
    const rows = Array.from({ length: 25 }, (_, i) => i)
    const result = await runPdfBatches({
      rows,
      callsUsedToday: 3992,
      dailyBudget: XERO_BACKFILL_DAILY_CALL_BUDGET,
      batchSize: 10,
      pauseMs: XERO_BACKFILL_PDF_BATCH_PAUSE_MS,
      now: () => new Date("2026-09-23T10:00:00.000Z"),
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      fetchRow: async (row) => {
        fetched.push(row)
        return { calls: 1, stored: true }
      },
      onBatch: () => {},
    })

    assert.deepEqual(fetched, [0, 1, 2, 3, 4, 5, 6, 7])
    assert.equal(result.outcome, "incomplete")
    assert.equal(result.callsUsedToday, 4000)
    assert.equal(result.remainingRows, 17)
    assert.equal(sleeps.length, 0)
    assert.equal(result.rerunAfterUtc, "2026-09-24T00:00:00.000Z")
  })

  it("keeps stored, reused and fetched growing past a batch boundary", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => i)
    const batches: Array<{ stored: number; reused: number; fetched: number; unstored: number }> = []
    const result = await runPdfBatches({
      rows,
      callsUsedToday: 0,
      batchSize: 10,
      pauseMs: 0,
      sleep: async () => {},
      fetchRow: async (row) => {
        if (row === 3) return { calls: 1, stored: false, kind: "unstored" }
        if (row % 2 === 0) return { calls: 0, stored: true, kind: "reused" }
        return { calls: 1, stored: true, kind: "fetched" }
      },
      onBatch: (info) => {
        batches.push({
          stored: info.stored,
          reused: info.reused,
          fetched: info.fetched,
          unstored: info.unstored,
        })
      },
    })

    assert.equal(batches.length, 2)
    assert.equal(batches[0]?.stored, 9)
    assert.equal(batches[1]?.stored, 11)
    assert.ok((batches[1]?.stored ?? 0) > (batches[0]?.stored ?? 0))
    assert.equal(result.stored, 11)
    assert.equal(result.reused, 6)
    assert.equal(result.fetched, 5)
    assert.equal(result.unstored, 1)
  })
})

describe("PDF backfill persist", () => {
  const xanoStub = {
    meta: {},
    mime: "",
    name: "",
    path: "",
    size: 0,
    type: "",
    access: "public",
  }
  const nextFile = {
    url: "https://blob.example/xero-invoices/inv-stub/INV-STUB.pdf",
    pathname: "xero-invoices/inv-stub/INV-STUB.pdf",
    filename: "INV-STUB.pdf",
    size: 12,
    uploadedAt: "2026-09-24T00:00:00.000Z",
  }

  it("writes the url onto a jsonb stub that has no url", async () => {
    const row = { pdf_file: xanoStub as unknown }
    const affected = await persistBackfillPdfFile(
      async (query) => {
        const text = sqlText(query)
        const matchesPending =
          text.includes("pdf_file->>'url' IS NULL") &&
          text.includes("pdf_file->>'url' = ''") &&
          text.includes("pdf_file IS NULL")
        const matches =
          text.includes("xero_invoice_id") &&
          (matchesPending ? pdfBackfillUrlMissing(row.pdf_file) : row.pdf_file == null)
        if (!matches) return { count: 0, rowCount: 0 }
        row.pdf_file = nextFile
        return { count: 1, rowCount: 1 }
      },
      "xero_ar_invoices",
      "inv-stub",
      nextFile,
    )

    assert.equal(affected, 1)
    assert.equal(pdfBackfillUrlMissing(row.pdf_file), false)
    assert.equal((row.pdf_file as { url: string }).url, nextFile.url)
  })

  it("counts a zero-row update as unstored and finishes incomplete while urls are missing", () => {
    assert.equal(pdfBackfillStepOutcome("success", 0), "success")
    assert.equal(pdfBackfillStepOutcome("success", 1245), "incomplete")
    assert.equal(pdfBackfillStepOutcome("incomplete", 0), "incomplete")
    const text = sqlText(pdfBackfillStillMissingQuery("2025-07-01"))
    assert.match(text, /xero_ar_invoices/)
    assert.match(text, /xero_ap_bills/)
    assert.match(text, /pdf_file->>'url' IS NULL/)
    assert.match(text, /pdf_file->>'url' = ''/)
  })
})

describe("re-match writes only single-candidate rows", () => {
  it("writes a blank row with exactly one published MBA and skips the rest", async () => {
    const writes: Array<{ id: number; mbaNumber: string }> = []
    const summary = await applyPublishedMbaRematch({
      rows: [
        { id: 1, referenceRaw: "(PENFOLD018)", mbaNumber: null },
        { id: 2, referenceRaw: "(PENFOLD018) | (GOLF023)", mbaNumber: null },
        { id: 3, referenceRaw: "campaign with no token", mbaNumber: null },
        { id: 4, referenceRaw: "(PENFOLD018)", mbaNumber: "ALREADY" },
        { id: 5, referenceRaw: "(DRAFT999)", mbaNumber: null },
      ],
      publishedMasters: [
        { id: 18, mba_number: "PENFOLD018" },
        { id: 23, mba_number: "GOLF023" },
      ],
      write: async (row) => {
        writes.push({ id: row.id, mbaNumber: row.mbaNumber })
      },
    })

    assert.deepEqual(writes, [{ id: 1, mbaNumber: "PENFOLD018" }])
    assert.deepEqual(
      summary.changed.map((row) => row.id),
      [1],
    )
    assert.deepEqual(
      summary.two.map((row) => row.id),
      [2],
    )
    assert.deepEqual(
      summary.none.map((row) => row.id).toSorted((a, b) => a - b),
      [3, 5],
    )
  })
})

describe("call pacer", () => {
  it("holds the 51st call so a minute never contains more than 50", async () => {
    let now = 1_000
    const sleeps: number[] = []
    const pace = createCallPacer({
      limit: 50,
      windowMs: 60_000,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms)
        now += ms
      },
    })
    for (let i = 0; i < 50; i++) await pace()
    assert.equal(sleeps.length, 0)
    await pace()
    assert.equal(sleeps.length, 1)
    assert.ok(sleeps[0] > 0)
    assert.ok(now - 1_000 >= 60_000)
  })
})
