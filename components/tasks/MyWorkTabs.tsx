"use client"

/**
 * My Work tabs (B42, plan 3.2, switch `codex_my_work`): Assigned to me,
 * Assigned by me, Following. Picking a tab replaces My tasks, My week, the
 * assignee and Unassigned; picking it again goes back to the usual filters.
 * Board (grouped by status) or list as the page already offers; saved views
 * keep the tab (`?mywork=`). Presentational (render-tested).
 */
import { Button } from "@/components/ui/button"
import { MY_WORK_TAB_LABELS, MY_WORK_TABS, type MyWorkTab } from "@/lib/codex/queryHelpers"

export function MyWorkTabs({
  value,
  onChange,
  projectsReady,
}: {
  value: MyWorkTab | null
  onChange: (tab: MyWorkTab | null) => void
  /** False before migration 0118: Assigned by me and Following find nothing yet. */
  projectsReady: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="My Work">
      <span className="text-xs font-medium text-muted-foreground">My Work</span>
      {MY_WORK_TABS.map((tab) => (
        <Button
          key={tab}
          type="button"
          size="sm"
          variant={value === tab ? "default" : "outline"}
          aria-pressed={value === tab}
          onClick={() => onChange(value === tab ? null : tab)}
        >
          {MY_WORK_TAB_LABELS[tab]}
        </Button>
      ))}
      {!projectsReady && (value === "assigned_by" || value === "following") ? (
        <span className="text-xs text-muted-foreground">Assigned by me and Following need a database update first.</span>
      ) : null}
    </div>
  )
}
