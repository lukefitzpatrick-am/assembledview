/** @vitest-environment jsdom */
/**
 * B59 (C-277, S9 A): the web report builder's account picker says "no data
 * since" after 14 days counted to the Melbourne day, never the UTC day or
 * the viewer's own day. The picker runs only in the browser, but its bug is
 * the viewer's zone, so this file runs in both zones (B59fix, review R1): the
 * UTC pass stands in for a viewer outside Melbourne. Clock mocked where the
 * UTC day is the day before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 * The last data date is 15 Melbourne days back: stale on the Melbourne day,
 * 14 days (not stale) on the UTC day.
 */
import "@/lib/testing/bothZones"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ReportBuilder } from "@/components/dashboard/web/ReportBuilder"

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}))

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", lastDataDate: "2026-11-16", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", lastDataDate: "2026-06-16", label: "1 Jul 07:00 AEST" },
] as const

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("web report builder account staleness", () => {
  for (const { at, lastDataDate, label } of INSTANTS) {
    it(`counts days to the Melbourne day (${label})`, async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: Date.parse(at) })
      ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
          if (body.action === "accounts") {
            return {
              ok: true,
              json: async () => ({
                accounts: {
                  ready: true,
                  ga4: [{ ref: "1", label: "Stale property", lastDataDate, linkedTo: null }],
                  gsc: [],
                },
              }),
            }
          }
          return new Promise(() => {})
        }),
      )
      const host = document.createElement("div")
      document.body.appendChild(host)
      const root = createRoot(host)
      await act(async () => {
        root.render(
          <ReportBuilder
            slug="client-a"
            clientName="Client A"
            initialLayout={[{ elementId: "notes", settings: { text: "Hello" } }]}
            currentVersion={0}
            versions={[]}
            ga4PropertyRef={null}
            gscSiteRef={null}
            brandTerms={[]}
            defaultPeriod="last_month"
            keyEventNames={[]}
          />,
        )
      })
      await act(async () => {
        await Promise.resolve()
      })
      const ga4 = host.querySelector("#builder-ga4") as HTMLSelectElement
      const option = [...ga4.options].find((o) => o.value === "1")
      expect(option?.textContent).toContain(`no data since ${lastDataDate}`)
      act(() => root.unmount())
      host.remove()
    })
  }
})
