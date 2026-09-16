import type { CampaignKpiSaveResult } from "@/lib/kpi/saveCampaignKpis"
import type { ResolvedKPIRow } from "@/lib/kpi/types"

export const MEDIA_PLAN_KPI_DEFERRED_SAVE_NOTE =
  "KPIs are held with the plan and written when you save it."

/**
 * Behaviour contract for a host that supplies KPI rows to KPIEditModal
 * and receives edits back. Two implementations:
 *
 * - MediaPlanKpiHost (this file): wraps the media-plan editor pages' KPI
 *   state. Save updates page state in memory and, when the plan already
 *   has an identity, persists campaign_kpi immediately. Plan save still
 *   syncs the version it just wrote (including VP-1 increments).
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
  /** Shown under Save KPIs when persistence is deferred to plan save. */
  saveNote?: string
}

export interface MediaPlanKpiHostArgs {
  rows: ResolvedKPIRow[]
  setRows: (rows: ResolvedKPIRow[]) => void
  onResetSavedLayer: () => void
  isSaving?: boolean
  persist?: (rows: ResolvedKPIRow[]) => Promise<CampaignKpiSaveResult>
  setIsSaving?: (saving: boolean) => void
}

/**
 * Factory for the media-plan editor host.
 *   - onSave always calls setRows (in-memory).
 *   - When persist is provided, onSave then awaits it (campaign_kpi write).
 *   - When persist is omitted, Save stays in-memory and saveNote explains the deferral.
 *   - onReset clears the saved tier so resolver re-runs from publisher/client only.
 */
export function createMediaPlanKpiHost(args: MediaPlanKpiHostArgs): KpiHost {
  return {
    rows: args.rows,
    isSaving: args.isSaving ?? false,
    saveNote: args.persist ? undefined : MEDIA_PLAN_KPI_DEFERRED_SAVE_NOTE,
    onSave: async (updatedRows) => {
      args.setRows(updatedRows)
      if (!args.persist) return
      args.setIsSaving?.(true)
      try {
        await args.persist(updatedRows)
      } finally {
        args.setIsSaving?.(false)
      }
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
