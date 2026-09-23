/**
 * Client campaign billing download uses the shared Excel workbook.
 *
 * @vitest-environment jsdom
 */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toastCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/dashboard/acme/MBA-1",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/components/ui/use-toast", () => ({
  toast: (args: Record<string, unknown>) => {
    toastCalls.push(args)
  },
}))

import CampaignActions from "../CampaignActions"

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function pointerCaptureShim() {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
  }
}

const billingSchedule = [
  {
    monthYear: "January 2026",
    mediaTotal: "$0",
    feeTotal: "$0",
    totalAmount: "$100.00",
    adservingTechFees: "$0",
    production: "$0",
    mediaCosts: {
      search: "$0",
      socialMedia: "$0",
      television: "$0",
      radio: "$0",
      newspaper: "$0",
      magazines: "$0",
      ooh: "$0",
      cinema: "$0",
      digiDisplay: "$0",
      digiAudio: "$0",
      digiVideo: "$0",
      bvod: "$0",
      integration: "$0",
      progDisplay: "$0",
      progVideo: "$0",
      progBvod: "$0",
      progAudio: "$0",
      progOoh: "$0",
      influencers: "$0",
      production: "$0",
    },
  },
]

function findButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((el) =>
    el.textContent?.includes(label),
  )
}

async function openMenu(button: HTMLElement) {
  await act(async () => {
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    button.click()
  })
}

describe("CampaignActions billing Excel download", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    toastCalls.length = 0
    pointerCaptureShim()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it("saves an xlsx blob named billing-schedule-{mba}.xlsx", async () => {
    const downloads: { blob: Blob; filename: string }[] = []
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      downloads.push({ blob: blob as Blob, filename: "" })
      return "blob:billing"
    })
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = origCreate(tag, options)
      if (tag.toLowerCase() === "a") {
        const anchor = el as HTMLAnchorElement
        anchor.click = () => {
          const last = downloads.at(-1)
          if (last) last.filename = anchor.download
        }
      }
      return el
    })

    act(() => {
      root.render(
        <CampaignActions
          variant="floating"
          mbaNumber="MBA-1"
          campaign={{
            campaign_name: "Spring",
            mp_client_name: "Acme",
            mp_brand: "Acme Brand",
          }}
          lineItems={{}}
          billingSchedule={billingSchedule}
          xanoFileOrigin=""
          mediaPlanFileMeta={null}
          mbaPdfFileMeta={null}
          availableVersions={[]}
          currentVersion={1}
        />,
      )
    })

    const downloadsButton = findButton(container, "Downloads")
    expect(downloadsButton).toBeTruthy()
    await openMenu(downloadsButton!)

    const item = [...document.body.querySelectorAll("[role='menuitem']")].find((el) =>
      el.textContent?.includes("Download billing schedule (Excel)"),
    )
    expect(item).toBeTruthy()

    await act(async () => {
      item!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      ;(item as HTMLElement).click()
    })

    await vi.waitFor(
      () => {
        expect(downloads, JSON.stringify(toastCalls)).toHaveLength(1)
      },
      { timeout: 15000 },
    )

    expect(downloads[0].blob.type).toBe(XLSX_MIME)
    expect(downloads[0].filename).toBe("billing-schedule-MBA-1.xlsx")
  })
})
