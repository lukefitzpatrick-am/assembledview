/** @vitest-environment jsdom */
/**
 * B44 (C-200, switch codex_contained_writes): campaign detail Ask for help.
 * Off: the in-page dialog, exactly as before. On: a link that opens Tasks with
 * Ask for help filled in from the campaign; the page writes nothing.
 */
import fs from "node:fs"
import path from "node:path"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CampaignDetailModal } from "@/components/pacing/detail/CampaignDetailModal"
import { setClientFeatureSnapshot } from "@/lib/features/client"
import { parseTasksComposeParams } from "@/lib/codex/composeLink"
import { lineCardFromSearch } from "@/lib/pacing/channel/lineCardModel"
import { searchFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import { assembleCampaignDetailPayload } from "@/lib/pacing/detail/assembleCampaignDetailPayload"
import { p6FixtureRows, P6_AS_OF } from "@/lib/pacing/portfolio/__tests__/p6Fixture"

function fixturePayload() {
  const row = p6FixtureRows().find((item) => item.mbaNumber === "BICAU002")!
  const line = lineCardFromSearch(searchFixture({ mbaNumber: row.mbaNumber, campaignName: row.campaignName }), P6_AS_OF)
  return {
    ...assembleCampaignDetailPayload({
      row,
      lines: [{ ...line, cpm: null, views: null, buyType: null, fixedCost: false }],
      asOf: P6_AS_OF,
    }),
    clientId: 42,
  }
}

describe("Campaign detail Ask for help (B44, C-200)", () => {
  const payload = fixturePayload()
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    setClientFeatureSnapshot(null)
  })

  function renderNotesTab() {
    act(() => {
      root.render(
        <CampaignDetailModal
          mba={payload.row.mbaNumber}
          asOf={P6_AS_OF}
          payload={payload}
          loading={false}
          error={null}
          onClose={() => {}}
          onReload={() => {}}
        />,
      )
    })
    const notesTab = [...container.querySelectorAll("button")].find((el) => el.textContent === "Notes & actions")
    act(() => notesTab!.click())
  }

  it("switch off: the Ask for help button opens the in-page dialog, as before", async () => {
    setClientFeatureSnapshot({ codex_contained_writes: false })
    renderNotesTab()
    const button = [...container.querySelectorAll("button")].find((el) => el.textContent === "Ask for help")
    expect(button).toBeTruthy()
    expect(container.textContent).not.toContain("Ask for help in Tasks")
    act(() => button!.click())
    await act(async () => {
      await Promise.resolve()
    })
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain("/api/codex/team")
    expect(urls).toContain("/api/codex/tasks?mba_number=BICAU002&per_page=20")
  })

  it("switch on: a link opens Tasks with Ask for help filled in from the campaign; no dialog, no Codex call", () => {
    setClientFeatureSnapshot({ codex_contained_writes: true })
    renderNotesTab()
    expect([...container.querySelectorAll("button")].some((el) => el.textContent === "Ask for help")).toBe(false)
    const link = [...container.querySelectorAll("a")].find((el) => el.textContent === "Ask for help in Tasks")
    expect(link).toBeTruthy()
    const href = link!.getAttribute("href")!
    expect(href.startsWith("/tasks?compose=help&")).toBe(true)
    const parsed = parseTasksComposeParams(new URL(href, "https://app.test").searchParams)
    expect(parsed).toEqual({
      compose: "help",
      prefill: { title: payload.row.campaignName, clientId: 42, mbaNumber: "BICAU002", category: "pacing" },
      notes: [],
    })
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/codex"))).toBe(false)
  })

  it("source: the old dialog renders only with the switch off", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/pacing/detail/CampaignDetailModal.tsx"), "utf8")
    expect(src).toContain("const containedWrites = codexContainedWritesOn()")
    expect(src).toContain("{containedWrites ? null : <CampaignAskHelpDialog")
  })
})
