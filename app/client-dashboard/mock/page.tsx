"use client"

import { useMemo, useState } from "react"

import { CuratifExample, MOCK_CURATIF_PRIMARY_HEX } from "@/components/client-dashboard/examples/CuratifExample"
import { MOCK_MOLICARE_PRIMARY_HEX, MolicareExample } from "@/components/client-dashboard/examples/MolicareExample"
import { CLIENT_DASHBOARD_FOCUS_RING } from "@/components/client-dashboard/focus-styles"
import { cn } from "@/lib/utils"

type ClientKey = "molicare" | "curatif"

export default function ClientDashboardMockPage() {
  const [client, setClient] = useState<ClientKey>("molicare")

  const activeHex = useMemo(
    () => (client === "molicare" ? MOCK_MOLICARE_PRIMARY_HEX : MOCK_CURATIF_PRIMARY_HEX),
    [client],
  )

  return (
    <div className="bg-dashboard-surface">
      <div className="sticky top-0 z-20 border-b border-border bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Example client">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</span>
            <button
              type="button"
              role="tab"
              aria-selected={client === "molicare"}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                CLIENT_DASHBOARD_FOCUS_RING,
                client === "molicare"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted/60",
              )}
              onClick={() => setClient("molicare")}
            >
              MoliCare
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={client === "curatif"}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                CLIENT_DASHBOARD_FOCUS_RING,
                client === "curatif"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted/60",
              )}
              onClick={() => setClient("curatif")}
            >
              Curatif
            </button>
          </div>
          <div className="text-right">
            <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Brand primary (design ref)
            </div>
            <div className="font-mono text-xs text-foreground">{activeHex}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-3 py-4">
        {client === "molicare" ? <MolicareExample /> : <CuratifExample />}
      </div>
    </div>
  )
}
