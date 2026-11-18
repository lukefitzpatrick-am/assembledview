/**
 * The plan form's save boundary (B52, S33 A): the refusals both plan pages run
 * at the top of `handleSaveAll`, before any prompt or request, in one place.
 * S1 (publish refuses the hard list) builds here.
 *
 * `planSavePreflight` is pure. The page passes its stop to `showSaveStop`
 * and returns: a field stop (B58) is said once and focus moves to the field
 * (a toast when no field shows it), any other stop toasts (none for a second
 * click while a save runs).
 * Prompts that ask the planner (over budget, AA publish warnings) stay in the
 * page: they are questions, not refusals. The over budget wording is
 * `overBudgetQuestion` (B57).
 */
import {
  billingAliasGhostSaveBlockMessage,
  findBillingAliasGhostPairs,
  removeOldAliasGhostRows,
  type BillingAliasGhostPair,
} from "@/lib/billing/billingAliasGhostPairs"
import type { BillingAliasNumberCheck } from "@/lib/billing/billingLineIdAlias"
import type { BillingMonth } from "@/lib/billing/types"
import {
  shouldBlockSaveForBillingOverridesLoad,
  type BillingOverridesLoadState,
} from "@/lib/finance/billingOverridesSaveIntent"
import { END_BEFORE_START_MESSAGE } from "@/lib/mediaplan/dateOrder"
import { MBA_NUMBER_LOADING_MESSAGE } from "@/lib/mediaplan/createHeldMaster"
import { announce } from "@/components/ui/announcer"

type SaveStopCode =
  | "clients-unavailable"
  | "dates-out-of-order"
  | "save-in-flight"
  | "mba-number-loading"
  | "mba-number-problem"
  | "duplicate-lines"
  | "billing-alias-ghost"
  | "lines-loading"
  | "channel-load-failed"
  | "billing-overrides-not-loaded"

type SaveStop = {
  code: SaveStopCode
  /** Null: refuse without a toast (a second click while a save runs). */
  toast: { title: string; description?: string; variant?: "destructive" } | null
  /**
   * A field's own error (shown under the field already): said and focused,
   * not toasted (B58). The toast shows only when no field on the page shows it.
   */
  fieldMessage?: string
  /** Create: ask for a fresh MBA number (blank, or another client's). */
  refetchMbaNumber?: boolean
}

type CommonChecks = {
  /** The clients list failed to load (the page's `saveBlockedByClientsError`). */
  clientsError: string | null | undefined
  clientsBlocked: boolean
  datesOutOfOrder: boolean
}

/** Create: the MBA number is minted on this page, before the first save. */
export type CreateSaveChecks = CommonChecks & {
  mode: "create"
  saveInFlight: boolean
  mbaNumberPending: boolean
  /** `mbaNumberClientProblem` while no master is held, else null. */
  mbaNumberProblem: { message: string; refetch: boolean } | null
}

/** Edit: the plan loads from a saved version and its billing. */
export type EditSaveChecks = CommonChecks & {
  mode: "edit"
  duplicateLines: boolean
  /** Ghost pairs on the working schedule (empty with the switch off). */
  billingAliasGhostPairs: readonly BillingAliasGhostPair[]
  billingMonthOrder: readonly string[]
  linesStillLoading: boolean
  channelLoadFailed: boolean
  channelLoadFailedReason: string | null | undefined
  billingOverridesLoadState: BillingOverridesLoadState
  pendingBillingOverrideCount: number
}

/** The first refusal, in each page's order, or null to go on with the save. */
export function planSavePreflight(checks: CreateSaveChecks | EditSaveChecks): SaveStop | null {
  if (checks.clientsBlocked) {
    return {
      code: "clients-unavailable",
      toast: {
        title: "Save disabled",
        description: checks.clientsError ?? "Client list unavailable — try again",
        variant: "destructive",
      },
    }
  }
  if (checks.datesOutOfOrder) {
    return {
      code: "dates-out-of-order",
      toast: { title: "Publish disabled", description: END_BEFORE_START_MESSAGE, variant: "destructive" },
      fieldMessage: END_BEFORE_START_MESSAGE,
    }
  }
  return checks.mode === "create" ? createStop(checks) : editStop(checks)
}

function createStop(checks: CreateSaveChecks): SaveStop | null {
  if (checks.saveInFlight) return { code: "save-in-flight", toast: null }
  // B7 review finding 1: every save route comes through handleSaveAll.
  if (checks.mbaNumberPending) {
    return { code: "mba-number-loading", toast: { title: "Not saved yet", description: MBA_NUMBER_LOADING_MESSAGE } }
  }
  if (checks.mbaNumberProblem) {
    return {
      code: "mba-number-problem",
      toast: { title: "Not saved", description: checks.mbaNumberProblem.message, variant: "destructive" },
      refetchMbaNumber: checks.mbaNumberProblem.refetch,
    }
  }
  return null
}

function editStop(checks: EditSaveChecks): SaveStop | null {
  if (checks.duplicateLines) {
    return {
      code: "duplicate-lines",
      toast: {
        title: "Save disabled",
        description: "Duplicate line-item rows detected — fix before saving.",
        variant: "destructive",
      },
    }
  }
  // B20 ghost-row guard: never save while billing counts a line twice.
  const ghost = billingAliasGhostSaveBlockMessage(checks.billingAliasGhostPairs, checks.billingMonthOrder)
  if (ghost) {
    return {
      code: "billing-alias-ghost",
      toast: { title: "Cannot save: duplicate billing rows", description: ghost, variant: "destructive" },
    }
  }
  if (checks.linesStillLoading) {
    return { code: "lines-loading", toast: { title: "Line items still loading — please wait", variant: "destructive" } }
  }
  if (checks.channelLoadFailed) {
    return {
      code: "channel-load-failed",
      toast: {
        title: "Save disabled",
        description: checks.channelLoadFailedReason ?? "A channel failed to load — Retry before saving",
        variant: "destructive",
      },
    }
  }
  // MB-25: pending Applied work requires a successful overrides load — never
  // silently drop it via authoritative:false REPLACE-SET skip.
  if (
    shouldBlockSaveForBillingOverridesLoad({
      loadState: checks.billingOverridesLoadState,
      pendingCount: checks.pendingBillingOverrideCount,
    })
  ) {
    return {
      code: "billing-overrides-not-loaded",
      toast: {
        variant: "destructive",
        title: "Cannot save billing changes yet",
        description:
          "Manual billing overrides could not be loaded. Retry after overrides load, or cancel Applied timing first.",
      },
    }
  }
  return null
}

/**
 * The field a field stop is about: the invalid control whose described-by
 * message reads the stop's words (the campaign end date), else a burst row's
 * end date message. Never another invalid control on the page (B58fix R3).
 */
function fieldStopTarget(message: string): HTMLElement | null {
  for (const control of document.querySelectorAll<HTMLElement>('[aria-invalid="true"][aria-describedby]')) {
    const ids = control.getAttribute("aria-describedby")!.split(/\s+/)
    if (ids.some((id) => id && document.getElementById(id)?.textContent?.trim() === message)) return control
  }
  return document.querySelector<HTMLElement>("[data-date-order-error]")
}

/**
 * Shows a stop. A field stop is said once (assertive) and focus moves to the
 * field it is about. When no field on the page shows it (a burst row on a
 * standard container shows no message), it toasts, as any other stop does.
 */
export function showSaveStop(stop: SaveStop, toast: (message: NonNullable<SaveStop["toast"]>) => void): void {
  const target = stop.fieldMessage ? fieldStopTarget(stop.fieldMessage) : null
  if (stop.fieldMessage && target) {
    announce(stop.fieldMessage, "assertive")
    target.scrollIntoView?.({ block: "center" })
    target.focus()
    return
  }
  if (stop.toast) toast(stop.toast)
}

/**
 * B20 (switch `billing_ghost_row_guard`): the ghost pairs on the working
 * schedule. Off: none, so nothing is flagged and nothing is refused.
 */
export function billingAliasGhostPairsWhenOn(
  on: boolean,
  months: readonly BillingMonth[],
  mbaNumber: string | null | undefined,
  numberCheck: BillingAliasNumberCheck | null | undefined
): BillingAliasGhostPair[] {
  return on ? findBillingAliasGhostPairs(months, mbaNumber, numberCheck) : []
}

/**
 * "Keep the current rows": the months without the old row of each pair. The
 * page applies it to the working copy and the open draft only. Saved billing
 * is never touched here; the save writes the schedule from the plan lines.
 */
export function keepCurrentBillingRows(
  months: BillingMonth[],
  mbaNumber: string | null | undefined,
  numberCheck: BillingAliasNumberCheck | null | undefined
): BillingMonth[] {
  return removeOldAliasGhostRows(months, findBillingAliasGhostPairs(months, mbaNumber, numberCheck))
}
