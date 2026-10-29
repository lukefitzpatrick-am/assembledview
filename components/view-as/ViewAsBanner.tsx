"use client"

import { useEffect, useState } from "react"
import { Eye } from "lucide-react"

import type { ViewAsClientInfo } from "@/contexts/AuthContext"
import { exitViewAs, viewAsBannerText } from "@/components/view-as/viewAsClient"

/**
 * Shown on every page while an admin views as a client. Not dismissible.
 * At expiry it sends the browser to `/view-as/ended` so the screen never
 * flips to the admin view in front of a client.
 */
export function ViewAsBanner({ viewAs }: { viewAs: ViewAsClientInfo }) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const msLeft = viewAs.exp * 1000 - Date.now()
    if (msLeft <= 0) {
      window.location.assign("/view-as/ended")
      return
    }
    // setTimeout caps near 24.8 days; a view is at most 120 minutes.
    const timer = window.setTimeout(() => window.location.assign("/view-as/ended"), msLeft + 500)
    return () => window.clearTimeout(timer)
  }, [viewAs.exp])

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="view-as-banner"
      className="fixed bottom-20 left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-pill bg-am-ink px-4 py-2 text-sm text-am-white shadow-e2 md:bottom-4"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{viewAsBannerText(viewAs.clientName, viewAs.exp)}</span>
      <button
        type="button"
        disabled={exiting}
        onClick={async () => {
          setExiting(true)
          window.location.assign(await exitViewAs())
        }}
        className="shrink-0 rounded-pill bg-am-white px-3 py-1 text-xs font-semibold text-am-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {exiting ? "Exiting…" : "Exit"}
      </button>
    </div>
  )
}
