"use client"

import { StatTile, type StatTileMoneyState } from "@/components/finance/sections/StatTile"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"

const STATES: Array<{ title: string; state: StatTileMoneyState }> = [
  { title: "Loading", state: { status: "loading" } },
  { title: "Error", state: { status: "error", message: "Upstream timeout" } },
  { title: "Empty", state: { status: "empty" } },
  { title: "Ready (true zero)", state: { status: "ready", cents: 0 } },
]

/** Scratch strip for four-state StatTile — enable with ?chromeDemo=1 on /finance (flag ON). */
export function FinanceChromeDemo() {
  return (
    <Panel className="mt-6">
      <PanelHeader>
        <PanelTitle>Chrome demo — StatTile four states</PanelTitle>
      </PanelHeader>
      <PanelContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STATES.map((s) => (
            <StatTile
              key={s.title}
              label={s.title}
              basisCaption="billing · demo scope"
              state={s.state}
            />
          ))}
        </div>
      </PanelContent>
    </Panel>
  )
}
