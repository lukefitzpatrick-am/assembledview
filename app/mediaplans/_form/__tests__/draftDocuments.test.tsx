/**
 * B52: draft document downloads on both plan pages, as behaviour.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DRAFT_MBA_TOAST } from "@/lib/mediaplan/planWizardSaveBar"

const toastMock = vi.hoisted(() => vi.fn())
const postMock = vi.hoisted(() => vi.fn())
const clickMock = vi.hoisted(() => vi.fn())
vi.mock("@/components/ui/use-toast", () => ({ toast: toastMock }))
vi.mock("@/lib/docs/postDraftDocuments", () => ({ postDraftDocuments: postMock }))
vi.mock("@/lib/docs/clickBlobDownload", () => ({ clickBlobDownload: clickMock }))

import { downloadDraftDocument } from "../draftDocuments"

describe("downloadDraftDocument", () => {
  const busy: boolean[] = []
  const setBusy = (b: boolean) => busy.push(b)

  beforeEach(() => {
    busy.length = 0
    toastMock.mockReset()
    postMock.mockReset()
    clickMock.mockReset()
  })
  afterEach(() => vi.clearAllMocks())

  it("posts the body built for the kind, clicks the file and toasts the draft notice", async () => {
    const blob = new Blob(["x"])
    postMock.mockResolvedValue({ blob, filename: "DRAFT - x.pdf" })
    const body = vi.fn(async (kind: string) => ({ kind }))
    expect(await downloadDraftDocument({ kind: "mba_pdf", body, setBusy })).toBe(true)
    expect(body).toHaveBeenCalledWith("mba_pdf")
    expect(postMock).toHaveBeenCalledWith({ kind: "mba_pdf" })
    expect(clickMock).toHaveBeenCalledWith(blob, "DRAFT - x.pdf")
    expect(toastMock).toHaveBeenCalledWith({ title: DRAFT_MBA_TOAST })
    expect(busy).toEqual([true, false])
  })

  it("a failure toasts the error (or the kind's fallback) and clears busy", async () => {
    postMock.mockRejectedValue(new Error("Server said no"))
    expect(await downloadDraftDocument({ kind: "media_plan", body: () => ({}), setBusy })).toBe(false)
    expect(toastMock).toHaveBeenCalledWith({ title: "Error", description: "Server said no", variant: "destructive" })
    postMock.mockRejectedValue("not an error")
    await downloadDraftDocument({ kind: "aa_media_plan", body: () => ({}), setBusy })
    expect(toastMock).toHaveBeenLastCalledWith({
      title: "Error",
      description: "Failed to download draft AA media plan",
      variant: "destructive",
    })
    expect(clickMock).not.toHaveBeenCalled()
    expect(busy).toEqual([true, false, true, false])
  })

  it("quiet: no toast either way", async () => {
    postMock.mockResolvedValueOnce({ blob: new Blob(), filename: "f" }).mockRejectedValueOnce(new Error("x"))
    expect(await downloadDraftDocument({ kind: "media_plan", body: () => ({}), setBusy, quiet: true })).toBe(true)
    expect(await downloadDraftDocument({ kind: "media_plan", body: () => ({}), setBusy, quiet: true })).toBe(false)
    expect(toastMock).not.toHaveBeenCalled()
  })
})
