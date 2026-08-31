"use client"

import type { ReactNode } from "react"

/**
 * Sidebar save-status card for create/edit. Renders nothing when every slot is
 * empty so the rail does not show a blank card.
 *
 * Slot order is a twin-page contract: draft banner, then save-mode line, then
 * validation / save-blocking alerts. Copy and when each message appears stay
 * with the pages; this only hosts them.
 */
export function PlanWizardSaveMessages(props: {
  draftBanner?: ReactNode
  saveMode?: ReactNode
  alerts?: ReactNode
}) {
  const draftBanner = props.draftBanner ?? null
  const saveMode = props.saveMode ?? null
  const alerts = props.alerts ?? null
  if (draftBanner == null && saveMode == null && alerts == null) return null

  return (
    <div
      className="max-h-[min(14rem,32vh)] overflow-y-auto overscroll-contain rounded-frame border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-bg))] p-3 text-[hsl(var(--sidebar-foreground))] shadow-e1"
      role="status"
      aria-label="Save status"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-foreground)/0.65)]">
        Save status
      </p>
      <div className="mt-2 flex min-w-0 flex-col gap-1.5">
        {draftBanner != null ? <div className="min-w-0">{draftBanner}</div> : null}
        {saveMode != null ? <div className="min-w-0">{saveMode}</div> : null}
        {alerts != null ? <div className="min-w-0">{alerts}</div> : null}
      </div>
    </div>
  )
}
