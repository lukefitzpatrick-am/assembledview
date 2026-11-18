/**
 * C-340 (W5e): the naming workbook names every line by its stored line id.
 *
 * Both plan pages post each channel's Excel rows to /api/naming/generate,
 * which prints each row's `line_item_id` on the Input sheet and as the last
 * token of every trafficked name (pacing matches delivery back on it). This
 * mounts the twelve naming channels on a plan whose lines are 1, 2 and 4,
 * removes line 1, and builds the workbook the route builds from the rows.
 * Every line must be named 2 or 4, never by its position.
 *
 * @vitest-environment jsdom
 */
import "@/lib/testing/melbourneZone"

import { act, type ComponentType } from "react"
import { createRoot } from "react-dom/client"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { INPUT_TABLE_DATA_START_ROW, buildNamingWorkbook } from "@/lib/naming/exportNamingWorkbook"
import { parseNamingGenerateBody } from "@/lib/naming/generateFromPostedPlan"

vi.mock("@/contexts/MediaPlanContext", () => ({
  useMediaPlanContext: () => ({ mbaNumber: "tst001", setMbaNumber: () => {} }),
}))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  const publishers = async () => [{ id: 1, publisher_name: "Pub A" }]
  const sites = async () => [{ id: 11, platform: "Pub A", site: "Site A1" }]
  const mocked: Record<string, unknown> = { ...actual }
  for (const name of Object.keys(actual)) {
    if (name.startsWith("getPublishersFor")) mocked[name] = publishers
  }
  for (const name of ["getVideoSites", "getDisplaySites", "getAudioSites", "getBVODSites"]) {
    mocked[name] = sites
  }
  return mocked
})

const CONTAINERS: Record<string, ComponentType<any>> = {
  Search: (await import("@/components/media-containers/SearchContainer")).default,
  SocialMedia: (await import("@/components/media-containers/SocialMediaContainer")).default,
  Integration: (await import("@/components/media-containers/IntegrationContainer")).default,
  DigitalVideo: (await import("@/components/media-containers/DigitalVideoContainer")).default,
  DigitalAudio: (await import("@/components/media-containers/DigitalAudioContainer")).default,
  DigitalDisplay: (await import("@/components/media-containers/DigitalDisplayContainer")).default,
  BVOD: (await import("@/components/media-containers/BVODContainer")).default,
  ProgDisplay: (await import("@/components/media-containers/ProgDisplayContainer")).default,
  ProgVideo: (await import("@/components/media-containers/ProgVideoContainer")).default,
  ProgBVOD: (await import("@/components/media-containers/ProgBVODContainer")).default,
  ProgAudio: (await import("@/components/media-containers/ProgAudioContainer")).default,
  ProgOOH: (await import("@/components/media-containers/ProgOOHContainer")).default,
}

/** The page's naming body key, the container, its fee prop and its id code. */
const CHANNELS: [string, string, string, string][] = [
  ["search", "Search", "feesearch", "SE"],
  ["socialMedia", "SocialMedia", "feesocial", "SM"],
  ["integration", "Integration", "feeintegration", "IT"],
  ["digiVideo", "DigitalVideo", "feedigivideo", "DV"],
  ["digiAudio", "DigitalAudio", "feedigiaudio", "DA"],
  ["digiDisplay", "DigitalDisplay", "feedigidisplay", "DD"],
  ["bvod", "BVOD", "feebvod", "BV"],
  ["progDisplay", "ProgDisplay", "feeprogdisplay", "PD"],
  ["progVideo", "ProgVideo", "feeprogvideo", "PV"],
  ["progBvod", "ProgBVOD", "feeprogbvod", "PB"],
  ["progAudio", "ProgAudio", "feeprogaudio", "PA"],
  ["progOoh", "ProgOOH", "feeprogooh", "PO"],
]

/** Lines 1, 2 and 4 read back with `line_item` as the saved position, as Postgres gives them. */
function gapLines(code: string) {
  return [1, 2, 4].map((n, position) => ({
    id: 9000 + n,
    line_item_id: `tst001${code}${n}`,
    line_item: position,
    publisher: "Pub A",
    platform: "Pub A",
    site: "Site A1",
    bid_strategy: "reach",
    buy_type: "cpm",
    objective: `objective ${n}`,
    campaign: `campaign ${n}`,
    creative_targeting: `targeting ${n}`,
    targeting_attribute: `targeting ${n}`,
    creative: `creative ${n}`,
    buying_demo: "P18+",
    market: "National",
    fixed_cost_media: false,
    client_pays_for_media: false,
    budget_includes_fees: false,
    no_adserving: false,
    bursts: [{ budget: `$${n},000.00`, buyAmount: "$10.00", startDate: "2026-01-12", endDate: "2026-02-08" }],
  }))
}

async function settle(ms = 450) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

/** The Excel rows a channel hands the page after line 1 is removed. */
async function excelRowsAfterRemove(file: string, feeProp: string, code: string) {
  const Component = CONTAINERS[file]
  let excel: unknown[] = []
  const noop = () => {}
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <Component
        clientId="client-1"
        {...{ [feeProp]: 12.5 }}
        onTotalMediaChange={noop}
        onBurstsChange={noop}
        onInvestmentChange={noop}
        onLineItemsChange={(rows: unknown[]) => {
          excel = rows
        }}
        onMediaLineItemsChange={noop}
        campaignStartDate={new Date(2026, 0, 5)}
        campaignEndDate={new Date(2026, 2, 31)}
        campaignBudget={100000}
        campaignId=""
        mediaTypes={[file]}
        initialLineItems={gapLines(code)}
      />,
    )
  })
  await settle()
  const remove = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Remove")
  expect(remove, `${file} Remove`).toBeTruthy()
  act(() => remove!.click())
  await settle()
  act(() => root.unmount())
  host.remove()
  return excel
}

describe("naming workbook line ids (C-340)", () => {
  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    if (!("ResizeObserver" in globalThis)) {
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    }
  })

  it("names every line of a plan with a removed line by its own stored id", async () => {
    const lineItems: Record<string, unknown[]> = {}
    const expected: string[] = []
    for (const [key, file, feeProp, code] of CHANNELS) {
      lineItems[key] = await excelRowsAfterRemove(file, feeProp, code)
      expected.push(`tst001${code}2`, `tst001${code}4`)
    }

    // The route's own parse, then the workbook it builds.
    const body = parseNamingGenerateBody({
      globals: { mba: "tst001", brand: "brand", client: "client", campaign: "campaign", month_start: "jan26" },
      lineItems,
      version: 1,
    })
    const workbook = await buildNamingWorkbook({
      globals: body.globals,
      lineItems: body.lineItems,
      version: 1,
    })

    const input = workbook.getWorksheet("Input sheet")!
    const named: string[] = []
    // The line table runs down from its first row to the first blank id.
    for (let r = INPUT_TABLE_DATA_START_ROW; input.getCell(r, 1).value; r++) {
      named.push(String(input.getCell(r, 1).value))
    }
    expect([...named].sort()).toEqual([...expected].sort())

    // No sheet names a line by a position id (line 1 is gone, so any "1" is one).
    const positionId = /tst001(?:SE|SM|IT|DV|DA|DD|BV|PD|PV|PB|PA|PO)1(?!\d)/i
    const hits: string[] = []
    workbook.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          const v = cell.value as unknown
          const text =
            v && typeof v === "object" && "result" in (v as object)
              ? String((v as { result: unknown }).result ?? "")
              : String(v ?? "")
          if (positionId.test(text)) hits.push(`${sheet.name}: ${text}`)
        })
      })
    })
    expect(hits).toEqual([])
  }, 120_000)
})
