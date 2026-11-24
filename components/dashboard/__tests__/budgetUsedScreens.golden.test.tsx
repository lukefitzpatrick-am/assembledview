/**
 * M1 goldens: the six spend-against-budget screens (C-395), pinned on what
 * each one paints today: bar widths, tick positions and percent text.
 * Pairs: half, over budget, nothing spent, negative spend, no budget, a third,
 * two thirds, a half-cent below budget and a fraction.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_GOLDEN=1 npx vitest run components/dashboard/__tests__/budgetUsedScreens.golden.test.tsx
 *
 * @vitest-environment jsdom
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}))
vi.mock("framer-motion", () => {
  const strip = (props: Record<string, unknown>) => {
    const { layout: _l, initial: _i, animate, transition: _t, ...dom } = props
    const width = (animate as { width?: string } | undefined)?.width
    return width === undefined ? dom : { ...dom, "data-width": width }
  }
  return {
    motion: {
      article: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
        <article {...strip(props)}>{children}</article>
      ),
      div: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
        <div {...strip(props)}>{children}</div>
      ),
    },
    useReducedMotion: () => true,
  }
})
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/components/ui/sheet", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Sheet: Pass,
    SheetContent: Pass,
    SheetDescription: Pass,
    SheetFooter: Pass,
    SheetHeader: Pass,
    SheetTitle: Pass,
  }
})
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({ isClient: false }),
  useIsAdmin: () => false,
}))
vi.mock("@/components/client-hub/ClientFinanceExcelExportDialog", () => ({ ClientFinanceExcelExportDialog: () => null }))
vi.mock("@/components/client-hub/UpcomingBillingSection", () => ({ UpcomingBillingSection: () => null }))

const { CampaignCardCompact } = await import("@/components/dashboard/CampaignCardCompact")
const { default: CampaignDetailsModal } = await import("@/components/dashboard/campaign/CampaignDetailsModal")
const { ClientFinanceSlideOver } = await import("@/components/dashboard/modals/ClientFinanceSlideOver")
const { LinePacingCard } = await import("@/components/pacing/channel/LinePacingCard")
const { CampaignBurstsTab } = await import("@/components/pacing/detail/CampaignBurstsTab")
const { CampaignPacingCard } = await import("@/components/pacing/portfolio/CampaignPacingCard")
const { lineCardFromSearch } = await import("@/lib/pacing/channel/lineCardModel")
const { LINE_AS_OF, searchFixture } = await import("@/lib/pacing/channel/__tests__/fixtures")
const { p6FixtureRows, P6_AS_OF } = await import("@/lib/pacing/portfolio/__tests__/p6Fixture")

const GOLDEN = resolve(process.cwd(), "components/dashboard/__tests__/fixtures/budgetUsedScreens.golden.json")

/** Used and budget. */
const PAIRS: ReadonlyArray<readonly [number, number]> = [
  [500, 1000],
  [1234.56, 1000],
  [0, 1000],
  [-50, 1000],
  [100, 0],
  [1, 3],
  [2, 3],
  [999.995, 1000],
  [33.333, 100],
  [7087.5, 13500],
]

/** What a screen paints from the measure: widths, tick offsets, percent text. */
function painted(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/(width|left):\s*([^;"]*%)|data-width="([^"]*)"|>([^<>]*-?\d[\d.,]*%[^<>]*)</g)) {
    out.push(m[3] !== undefined ? `animate ${m[3]}` : m[4] !== undefined ? `text ${m[4]}` : `${m[1]} ${m[2]}`)
  }
  return out
}

function burstsTabTotal(used: number, budget: number): string[] {
  const line = lineCardFromSearch(searchFixture(), "2026-03-10")
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() =>
    root.render(
      <CampaignBurstsTab
        lines={[line]}
        bursts={[
          {
            lineItemId: line.lineItemId,
            index: 0,
            name: "Burst 1",
            start: "2026-03-01",
            end: "2026-03-31",
            days: 31,
            budget,
            spend: used,
            expected: 1_500,
            pct: 82,
            status: "on_track",
            impressions: 1000,
            clicks: 10,
            views: 0,
            plannedDeliverable: 0,
            deliveredDeliverable: 0,
            perDayLeft: null,
          },
        ]}
        asOf="2026-03-10"
        onPlanScenario={() => {}}
        onDailyWindow={() => {}}
      />,
    ),
  )
  act(() => container.querySelector<HTMLButtonElement>("button.absolute")!.click())
  const total = [...container.querySelectorAll("tr")].find((tr) => tr.textContent?.includes("Campaign total"))
  const cells = [...(total?.querySelectorAll("td") ?? [])].map((td) => td.textContent ?? "")
  act(() => root.unmount())
  container.remove()
  return cells.slice(3, 4)
}

function screens() {
  const line = lineCardFromSearch(searchFixture(), LINE_AS_OF)
  const row = p6FixtureRows()[0]!
  return PAIRS.map(([used, budget]) => ({
    pair: [used, budget],
    campaignCardCompact: painted(
      renderToStaticMarkup(
        <CampaignCardCompact
          id="1"
          name="Golden"
          mbaNumber="m1001"
          status="live"
          mediaTypes={["Social"]}
          spentAmount={used}
          totalBudget={budget}
          href="/dashboard/golden/m1001"
          versionNumber={1}
          clientSlug="golden"
        />,
      ),
    ).filter((p) => p.startsWith("animate") || /^text -?\d[\d.,]*%$/.test(p)),
    campaignDetailsModal: painted(
      renderToStaticMarkup(
        <CampaignDetailsModal
          open
          onOpenChange={() => {}}
          campaign={{
            campaignName: "Golden",
            clientName: "Golden",
            mbaNumber: "m1001",
            status: "live",
            startDate: "2026-01-01",
            endDate: "2026-03-31",
            budget,
            actualSpend: used,
            expectedSpend: used,
            timeElapsedPct: 40,
            daysInCampaign: 90,
            daysElapsed: 36,
            daysRemaining: 54,
          }}
        />,
      ),
    ),
    clientFinanceSlideOver: painted(
      renderToStaticMarkup(
        <ClientFinanceSlideOver
          open
          onOpenChange={() => {}}
          finance={{
            totalBudget: budget,
            ytdSpend: used,
            budgetByQuarter: [
              { quarter: "Q1", budget, spent: used, status: "in-progress" },
              { quarter: "Q2", budget, spent: used, status: "complete" },
            ],
            spendByMediaType: [],
          }}
        />,
      ),
    ),
    linePacingCard: painted(
      renderToStaticMarkup(
        <LinePacingCard
          model={{ ...line, budget, spend: used, burstBudget: budget, burstSpend: used }}
          asOf={LINE_AS_OF}
        />,
      ),
    ),
    linePacingCardNoBudget: painted(
      renderToStaticMarkup(
        <LinePacingCard model={{ ...line, budget: 0, spend: used, linePct: 61.5, burstBudget: 0, burstPct: 42 }} asOf={LINE_AS_OF} />,
      ),
    ),
    campaignPacingCard: painted(
      renderToStaticMarkup(
        <CampaignPacingCard row={{ ...row, budget, spendToDate: used, expectedToDate: used / 2 }} asOf={P6_AS_OF} />,
      ),
    ),
    campaignBurstsTabTotal: burstsTabTotal(used, budget),
  }))
}

describe("M1 budget used screens golden", () => {
  it("paints today's widths, ticks and percents byte for byte", () => {
    const actual = JSON.parse(JSON.stringify(screens()))
    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`)
      return
    }
    expect(actual).toEqual(JSON.parse(readFileSync(GOLDEN, "utf8")))
  })
})
