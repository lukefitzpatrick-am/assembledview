"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { isPlanDraftsEnabled } from "@/lib/mediaplan/drafts/flag"
import {
  clearLocalDraft,
  estimateDraftPayloadBytes,
  readLocalDraft,
  writeLocalDraft,
} from "@/lib/mediaplan/drafts/localStore"
import {
  describePlanSavePill,
  pickNewerDraft,
  summarizeDraftOffer,
  type PlanSavePill,
} from "@/lib/mediaplan/drafts/pill"
import { compareDraftToTip } from "@/lib/mediaplan/drafts/compare"
import { resolvePostgresSaveMode } from "@/lib/mediaplan/resolvePostgresSaveMode"
import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"
import {
  clickResume,
  cloneDraftState,
  flushWhenHydrationSettled,
  initialPlanDraftRestoreGate,
} from "@/lib/mediaplan/drafts/applyRestore"
import {
  classifyDraftLoad,
  diffDraftAgainstBase,
  type DraftDiffSummary,
  type DraftLoadKind,
} from "@/lib/mediaplan/drafts/fieldDiff"

type OtherDraft = {
  userId: string
  userLabel: string | null
  updatedAt: string
}

type RecoveryOffer = {
  source: "local" | "server"
  reason: string
  summary: string
  state: PlanDraftStateV1
  updatedAt: string
  draftBaseVersionId: number | null
}

export type ActiveDraftSession = {
  updatedAt: string
  baseSnapshot: PlanDraftStateV1
}

export function usePlanDraftSession(args: {
  masterId: number | null
  mbaNumber: string
  userId?: string
  dirty: boolean
  baseVersionId: number | null
  campaignStatus: string | null | undefined
  publishedVersionNumber: number
  versionRowCount: number
  /** VC Stage 1 — tip `published_at`; null = unpublished overwrite. */
  tipPublishedAt?: string | null
  forceIncrement?: boolean
  /** VC Stage 2b — default save; pass publish for explicit version cut. */
  intent?: "save" | "publish"
  getSnapshot: () => PlanDraftStateV1
  onRestore: (state: PlanDraftStateV1) => void
  /** Discard of an applied draft — rehydrate the captured tip snapshot. */
  onRevertToBase?: (state: PlanDraftStateV1) => void
  /** Edit page: false until every enabled channel has settled from the tip. */
  hydrationSettled?: boolean
}) {
  /** Autosave chrome (3s/15s + soft Save draft) — still flag-gated. */
  const autosaveEnabled = isPlanDraftsEnabled()
  const [userId, setUserId] = useState(args.userId ?? "")
  const [pill, setPill] = useState<PlanSavePill | null>(null)
  const [lastAutosaveAt, setLastAutosaveAt] = useState<number | null>(null)
  const [recovery, setRecovery] = useState<RecoveryOffer | null>(null)
  const [activeDraft, setActiveDraft] = useState<ActiveDraftSession | null>(null)
  const [offer, setOffer] = useState<RecoveryOffer | null>(null)
  const [others, setOthers] = useState<OtherDraft[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [payloadBytes, setPayloadBytes] = useState<number | null>(null)
  const [staleCompare, setStaleCompare] = useState<unknown>(null)
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const getSnapshotRef = useRef(args.getSnapshot)
  getSnapshotRef.current = args.getSnapshot
  const onRestoreRef = useRef(args.onRestore)
  onRestoreRef.current = args.onRestore
  const onRevertToBaseRef = useRef(args.onRevertToBase)
  onRevertToBaseRef.current = args.onRevertToBase
  const restoreGateRef = useRef(initialPlanDraftRestoreGate())
  const pendingUpdatedAtRef = useRef<string | null>(null)
  const hydrationSettled = args.hydrationSettled !== false

  // Stage 2b: always resolve user for offer / working-draft save (flag may be off).
  useEffect(() => {
    if (userId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" })
        if (!res.ok) return
        const json = (await res.json()) as { user?: { email?: string } }
        const email = String(json.user?.email ?? "").trim()
        if (!cancelled && email) setUserId(email)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Primitive deps only — a fresh object every render re-fired the pill effect
  // (BUG-2 / max update depth on create+edit while NEXT_PUBLIC_PLAN_DRAFTS is off).
  const modeResolved = useMemo(
    () =>
      resolvePostgresSaveMode({
        campaignStatus: args.campaignStatus,
        forceIncrement: Boolean(args.forceIncrement),
        publishedVersionNumber: args.publishedVersionNumber,
        versionRowCount: args.versionRowCount,
        tipPublishedAt: args.tipPublishedAt,
        intent: args.intent,
      }),
    [
      args.campaignStatus,
      args.forceIncrement,
      args.publishedVersionNumber,
      args.versionRowCount,
      args.tipPublishedAt,
      args.intent,
    ]
  )

  // Always drive the save pill from describePlanSavePill (primary mode + draft
  // secondary). Autosave timers stay behind autosaveEnabled; pill text does not.
  useEffect(() => {
    const ago =
      lastAutosaveAt == null ? null : Math.max(0, (Date.now() - lastAutosaveAt) / 1000)
    setPill(
      describePlanSavePill({
        modeResolved,
        hasWorkingDraft: Boolean(recovery) || Boolean(activeDraft) || lastAutosaveAt != null || args.dirty,
        autosavedSecondsAgo: ago,
        editingUnpublishedDraft: args.dirty && modeResolved.uiMode === "overwrite",
      })
    )
  }, [modeResolved, lastAutosaveAt, recovery, activeDraft, args.dirty])

  const persistLocal = useCallback(
    async (opts?: { force?: boolean }) => {
      if ((!autosaveEnabled && !opts?.force) || !userId) return
      const state = getSnapshotRef.current()
      setPayloadBytes(estimateDraftPayloadBytes(state))
      await writeLocalDraft({
        masterId: args.masterId,
        mbaNumber: args.mbaNumber,
        userId,
        state,
      })
      setLastAutosaveAt(Date.now())
    },
    [autosaveEnabled, args.masterId, args.mbaNumber, userId]
  )

  const persistServer = useCallback(
    async (opts?: { force?: boolean }) => {
      if ((!autosaveEnabled && !opts?.force) || args.masterId == null || !userId) return
      const state = getSnapshotRef.current()
      setPayloadBytes(estimateDraftPayloadBytes(state))
      const res = await fetch("/api/plans/drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterId: args.masterId,
          baseVersionId: args.baseVersionId,
          state,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || `Draft save failed (${res.status})`)
      }
      await clearLocalDraft({
        masterId: args.masterId,
        mbaNumber: args.mbaNumber,
        userId,
      })
      setLastAutosaveAt(Date.now())
    },
    [autosaveEnabled, args.masterId, args.mbaNumber, userId, args.baseVersionId]
  )

  // Tier 1 ~3s after dirty
  useEffect(() => {
    if (!autosaveEnabled || !args.dirty) return
    if (localTimer.current) clearTimeout(localTimer.current)
    localTimer.current = setTimeout(() => {
      void persistLocal()
    }, 3000)
    return () => {
      if (localTimer.current) clearTimeout(localTimer.current)
    }
  }, [autosaveEnabled, args.dirty, persistLocal])

  // Tier 2 ~15s + blur
  useEffect(() => {
    if (!autosaveEnabled || !args.dirty || args.masterId == null) return
    if (serverTimer.current) clearTimeout(serverTimer.current)
    serverTimer.current = setTimeout(() => {
      void persistServer()
    }, 15000)
    const onBlur = () => {
      void persistServer()
    }
    window.addEventListener("blur", onBlur)
    return () => {
      if (serverTimer.current) clearTimeout(serverTimer.current)
      window.removeEventListener("blur", onBlur)
    }
  }, [autosaveEnabled, args.dirty, args.masterId, persistServer])

  const commitApply = useCallback((state: PlanDraftStateV1, updatedAt: string) => {
    const base = cloneDraftState(getSnapshotRef.current())
    pendingUpdatedAtRef.current = null
    setActiveDraft({ updatedAt, baseSnapshot: base })
    setRecovery(null)
    onRestoreRef.current(state)
  }, [])

  // On mount: load offer. Auto-apply matching-base drafts after hydration;
  // stale-base drafts keep a click (Load anyway). Never silently overlay a newer tip.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      const local = await readLocalDraft({
        masterId: args.masterId,
        mbaNumber: args.mbaNumber,
        userId,
      })
      let server: { updatedAt: string; state: PlanDraftStateV1; baseVersionId: number | null } | null =
        null
      let otherList: OtherDraft[] = []
      if (args.masterId != null) {
        const res = await fetch(`/api/plans/drafts?masterId=${args.masterId}`)
        if (res.ok) {
          const json = (await res.json()) as {
            draft?: {
              updatedAt: string
              draftStateJson: PlanDraftStateV1
              baseVersionId?: number | null
            } | null
            others?: OtherDraft[]
          }
          if (json.draft) {
            server = {
              updatedAt: json.draft.updatedAt,
              state: json.draft.draftStateJson,
              baseVersionId:
                json.draft.baseVersionId ?? json.draft.draftStateJson.baseVersionId ?? null,
            }
          }
          otherList = json.others ?? []
        }
      }
      if (cancelled) return
      setOthers(otherList)
      const pick = pickNewerDraft({
        localUpdatedAt: local?.updatedAt ?? null,
        serverUpdatedAt: server?.updatedAt ?? null,
      })
      if (pick.winner === "none") {
        setOffer(null)
        return
      }
      const state = pick.winner === "local" ? local!.state : server!.state
      const updatedAt = pick.winner === "local" ? local!.updatedAt : server!.updatedAt
      const draftBaseVersionId =
        pick.winner === "server"
          ? (server!.baseVersionId ?? state.baseVersionId ?? null)
          : (state.baseVersionId ?? null)
      const tipIds = state.meta.tipLineIds ?? []
      const draftIds = Object.values(state.channels)
        .flat()
        .map((row) =>
          String(
            (row as { line_item_id?: string; lineItemId?: string }).line_item_id ??
              (row as { lineItemId?: string }).lineItemId ??
              ""
          )
        )
        .filter(Boolean)
      const cmp = compareDraftToTip({
        tipLineIds: tipIds,
        draftLineIds: draftIds,
        tipBudgetCents: state.meta.tipBudgetCents ?? 0,
        draftBudgetCents: state.meta.budgetCents,
      })
      setOffer({
        source: pick.winner,
        reason: pick.reason,
        summary: summarizeDraftOffer({
          updatedAt,
          linesChanged: cmp.linesChanged || Math.max(0, state.meta.lineCount),
          budgetDeltaDollars: cmp.budgetDeltaCents / 100,
        }),
        state,
        updatedAt,
        draftBaseVersionId,
      })
    })().catch((err) => console.warn("[PC7] recovery probe failed", err))
    return () => {
      cancelled = true
    }
  }, [args.masterId, args.mbaNumber, userId])

  useEffect(() => {
    if (!offer || activeDraft || restoreGateRef.current.applied) return
    const kind = classifyDraftLoad({
      hasDraft: true,
      draftBaseVersionId: offer.draftBaseVersionId,
      tipVersionId: args.baseVersionId,
    })
    if (kind === "pending") {
      setRecovery(null)
      return
    }
    if (kind === "stale") {
      setRecovery(offer)
      return
    }
    setRecovery(null)
    pendingUpdatedAtRef.current = offer.updatedAt
    const result = clickResume(
      restoreGateRef.current,
      offer.state,
      hydrationSettled,
    )
    restoreGateRef.current = result.gate
    if (result.apply) commitApply(result.apply, offer.updatedAt)
  }, [offer, args.baseVersionId, hydrationSettled, activeDraft, commitApply])

  const discard = useCallback(async () => {
    const base = activeDraft?.baseSnapshot ?? null
    restoreGateRef.current = initialPlanDraftRestoreGate()
    pendingUpdatedAtRef.current = null
    setOffer(null)
    setRecovery(null)
    setActiveDraft(null)
    if (base) onRevertToBaseRef.current?.(base)
    if (!userId) return
    await clearLocalDraft({
      masterId: args.masterId,
      mbaNumber: args.mbaNumber,
      userId,
    })
    if (args.masterId != null) {
      await fetch(`/api/plans/drafts?masterId=${args.masterId}`, { method: "DELETE" })
    }
    setLastAutosaveAt(null)
  }, [args.masterId, args.mbaNumber, userId, activeDraft])

  const resume = useCallback(() => {
    const stale = recovery
    if (!stale) return
    const result = clickResume(
      restoreGateRef.current,
      stale.state,
      hydrationSettled,
    )
    restoreGateRef.current = result.gate
    pendingUpdatedAtRef.current = stale.updatedAt
    setRecovery(null)
    if (result.apply) commitApply(result.apply, stale.updatedAt)
  }, [recovery, hydrationSettled, commitApply])

  useEffect(() => {
    const result = flushWhenHydrationSettled(
      restoreGateRef.current,
      hydrationSettled,
    )
    restoreGateRef.current = result.gate
    if (result.apply) {
      commitApply(result.apply, pendingUpdatedAtRef.current ?? offer?.updatedAt ?? "")
    }
  }, [hydrationSettled, commitApply, offer?.updatedAt])

  const saveDraftNow = useCallback(async () => {
    if (!userId) {
      throw new Error("Not signed in — cannot save working draft")
    }
    if (args.masterId == null) {
      throw new Error("Missing master id — cannot save working draft")
    }
    await persistLocal({ force: true })
    await persistServer({ force: true })
  }, [persistLocal, persistServer, userId, args.masterId])

  const clearAfterPublish = useCallback(async () => {
    restoreGateRef.current = initialPlanDraftRestoreGate()
    pendingUpdatedAtRef.current = null
    setOffer(null)
    setRecovery(null)
    setActiveDraft(null)
    if (!userId) return
    await clearLocalDraft({
      masterId: args.masterId,
      mbaNumber: args.mbaNumber,
      userId,
    })
    if (args.masterId != null) {
      await fetch(`/api/plans/drafts?masterId=${args.masterId}`, { method: "DELETE" })
    }
    setLastAutosaveAt(null)
  }, [args.masterId, args.mbaNumber, userId])

  const loadKind: DraftLoadKind = activeDraft
    ? "auto"
    : recovery
      ? "stale"
      : offer
        ? classifyDraftLoad({
            hasDraft: true,
            draftBaseVersionId: offer.draftBaseVersionId,
            tipVersionId: args.baseVersionId,
          })
        : "none"

  const diffLive = useCallback((): DraftDiffSummary | null => {
    if (!activeDraft) return null
    return diffDraftAgainstBase(activeDraft.baseSnapshot, getSnapshotRef.current())
  }, [activeDraft])

  return {
    /** Autosave / soft Save draft chrome — flag-gated. */
    enabled: autosaveEnabled,
    pill,
    recovery,
    activeDraft,
    loadKind,
    diffLive,
    others,
    compareOpen,
    setCompareOpen,
    staleCompare,
    setStaleCompare,
    payloadBytes,
    resume,
    discard,
    saveDraftNow,
    clearAfterPublish,
    modeResolved,
    baseVersionId: args.baseVersionId,
  }
}
