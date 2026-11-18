/**
 * B57: the client finance export tells the user in the shared dialog (it was
 * the browser's alert()). Each message waits to be read: the window closes
 * only after OK on the "Downloaded workbook" note, and the stops leave it open.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const saveAsMock = vi.hoisted(() => vi.fn())

vi.mock("file-saver", () => ({ saveAs: saveAsMock }))
vi.mock("@/lib/finance/excelFinanceExport", () => ({
  writeMediaFinanceWorksheet: vi.fn(),
  writeSowFinanceWorksheet: vi.fn(),
  writeRetainerFinanceWorksheet: vi.fn(async (workbook: { addWorksheet: (name: string) => unknown }, name: string) => {
    workbook.addWorksheet(name)
  }),
  workbookToXlsxBuffer: vi.fn(async () => new ArrayBuffer(8)),
}))

import { ClientFinanceExcelExportDialog } from "@/components/client-hub/ClientFinanceExcelExportDialog"

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>
const onOpenChange = vi.fn()

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  saveAsMock.mockReset()
  onOpenChange.mockReset()
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ bookedApproved: [], other: [] }), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "error").mockImplementation(() => {})
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find((el) => el.textContent?.trim() === text)
  expect(found, text).toBeTruthy()
  return found as HTMLButtonElement
}

function render(record: Record<string, unknown>) {
  act(() =>
    root.render(
      <ClientFinanceExcelExportDialog open onOpenChange={onOpenChange} clientName="Acme" clientRecord={record} />,
    ),
  )
}

function untick(id: string) {
  const box = document.getElementById(id) as HTMLButtonElement
  expect(box, id).toBeTruthy()
  act(() => box.click())
}

const notice = () => document.querySelector('[role="alertdialog"]')

/** Clicks Download and waits for the message: the export loads exceljs with a dynamic import. */
async function download() {
  act(() => button("Download Excel").click())
  for (let i = 0; i < 200 && !notice(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  expect(notice()).toBeTruthy()
}

describe("ClientFinanceExcelExportDialog messages (B57)", () => {
  it("nothing ticked: says so, fetches nothing, stays open", async () => {
    render({})
    untick("fin-exp-media")
    untick("fin-exp-sow")
    untick("fin-exp-retainer")
    await download()
    expect(notice()?.textContent).toContain("Select at least one export type (media, retainer, or scopes of work).")
    expect(fetchMock).not.toHaveBeenCalled()
    act(() => button("OK").click())
    await settle()
    expect(notice()).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("no sheet to write: lists the warnings, saves nothing, stays open", async () => {
    render({})
    untick("fin-exp-sow")
    await download()
    expect(notice()?.textContent).toContain("Nothing to export")
    expect(notice()?.textContent).toContain("Media: no invoice rows for this client and month.")
    expect(notice()?.textContent).toContain("Retainer: no monthly retainer amount on file for this client.")
    act(() => button("OK").click())
    await settle()
    expect(saveAsMock).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("downloaded with warnings: the window closes only after OK", async () => {
    render({ monthlyretainer: 500 })
    untick("fin-exp-sow")
    await download()
    expect(saveAsMock).toHaveBeenCalledTimes(1)
    expect(notice()?.textContent).toContain("Downloaded workbook")
    expect(notice()?.textContent).toContain("Media: no invoice rows for this client and month.")
    expect(onOpenChange).not.toHaveBeenCalled()
    act(() => button("OK").click())
    await settle()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("a failed load says why and stays open", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }))
    render({})
    await download()
    expect(notice()?.textContent).toContain("Export failed")
    expect(notice()?.textContent).toContain("Failed to load media finance data")
    act(() => button("OK").click())
    await settle()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(button("Download Excel").disabled).toBe(false)
  })
})
