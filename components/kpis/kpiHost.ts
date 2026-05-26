import type { ResolvedKPIRow } from "@/lib/kpi/types"

/**
 * Behaviour contract for a host that supplies KPI rows to KPIEditModal
 * and receives edits back. Two implementations:
 *
 * - MediaPlanKpiHost (this file): wraps the media-plan editor pages' KPI
 *   state. Save updates page state in memory; campaign save handles Xano
 *   persistence via the existing fan-out + sync chain.
 * - PacingKpiHost (Stage 2d-7): wraps a single pacing line item. Save
 *   immediately syncs to Xano and refreshes the row.
 *
 * The host is a plain object — no React state, no class. Owners construct
 * it per-render (or memoise) with their current callbacks.
 */
export interface KpiHost {
  /** Rows to display in the modal. Media-plan: full campaign. Pacing: single row. */
  rows: ResolvedKPIRow[]
  /** True while a save is in flight (for spinner / disable). */
  isSaving: boolean
  /** Called with the full edited rows array when the user clicks Save KPIs. */
  onSave: (rows: ResolvedKPIRow[]) => void | Promise<void>
  /** Called when the user clicks Reset. Media-plan clears saved layer; pacing TBD in 2d-7. */
  onReset: () => void
}

export interface MediaPlanKpiHostArgs {
  rows: ResolvedKPIRow[]
  setRows: (rows: ResolvedKPIRow[]) => void
  onResetSavedLayer: () => void
  isSaving?: boolean
}

/**
 * Factory for the media-plan editor host. Behaviour mirrors the pre-2d-6
 * flow exactly:
 *   - onSave just calls setRows (in-memory; persistence deferred to campaign save).
 *   - onReset clears the saved tier so resolver re-runs from publisher/client only.
 *   - isSaving is currently false in all three pages but flows through for future use.
 */
export function createMediaPlanKpiHost(args: MediaPlanKpiHostArgs): KpiHost {
  return {
    rows: args.rows,
    isSaving: args.isSaving ?? false,
    onSave: (updatedRows) => {
      args.setRows(updatedRows)
    },
    onReset: () => {
      args.onResetSavedLayer()
    },
  }
}

export interface PacingKpiHostArgs {
  /** The resolved row to display in the modal (built via buildResolvedKpiRowFromPacing). */
  initialRow: ResolvedKPIRow
  /** Called when the user clicks Save KPIs. Should perform the sync and refresh display. */
  onSave: (editedRow: ResolvedKPIRow) => Promise<void>
  /** Called when the user clicks Reset. For now, just re-open with the initial row. */
  onReset: () => void
  /** Reflects async save state for spinner/disable. */
  isSaving: boolean
}

/**
 * Factory for the pacing-surface host. Single row in, single row out.
 * Save immediately syncs to Xano (via the caller's onSave) and triggers
 * an optimistic display refresh.
 */
export function createPacingKpiHost(args: PacingKpiHostArgs): KpiHost {
  return {
    rows: [args.initialRow],
    isSaving: args.isSaving,
    onSave: async (editedRows) => {
      const edited = editedRows[0]
      if (!edited) return
      await args.onSave(edited)
    },
    onReset: () => {
      args.onReset()
    },
  }
}
