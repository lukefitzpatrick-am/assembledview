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
  getSnapshot: () => PlanDraftStateV1
  onRestore: (state: PlanDraftStateV1) => void
}) {
  const enabled = isPlanDraftsEnabled()
  const [userId, setUserId] = useState(args.userId ?? "")
  const [pill, setPill] = useState<PlanSavePill | null>(null)
  const [lastAutosaveAt, setLastAutosaveAt] = useState<number | null>(null)
  const [recovery, setRecovery] = useState<RecoveryOffer | null>(null)
  const [others, setOthers] = useState<OtherDraft[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [payloadBytes, setPayloadBytes] = useState<number | null>(null)
  const [staleCompare, setStaleCompare] = useState<unknown>(null)
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const getSnapshotRef = useRef(args.getSnapshot)
  getSnapshotRef.current = args.getSnapshot

  useEffect(() => {
    if (!enabled || userId) return
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
  }, [enabled, userId])

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
      }),
    [
      args.campaignStatus,
      args.forceIncrement,
      args.publishedVersionNumber,
      args.versionRowCount,
      args.tipPublishedAt,
    ]
  )

  useEffect(() => {
    if (!enabled) {
      // No-op when already null — disabled hook must never schedule a render.
      setPill((prev) => (prev == null ? prev : null))
      return
    }
    const ago =
      lastAutosaveAt == null ? null : Math.max(0, (Date.now() - lastAutosaveAt) / 1000)
    setPill(
      describePlanSavePill({
        modeResolved,
        hasWorkingDraft: Boolean(recovery) || lastAutosaveAt != null || args.dirty,
        autosavedSecondsAgo: ago,
        editingUnpublishedDraft: args.dirty && modeResolved.uiMode === "overwrite",
      })
    )
  }, [
    enabled,
    modeResolved,
    lastAutosaveAt,
    recovery,
    args.dirty,
  ])

  const persistLocal = useCallback(async () => {
    if (!enabled || !userId) return
    const state = getSnapshotRef.current()
    setPayloadBytes(estimateDraftPayloadBytes(state))
    await writeLocalDraft({
      masterId: args.masterId,
      mbaNumber: args.mbaNumber,
      userId,
      state,
    })
    setLastAutosaveAt(Date.now())
  }, [enabled, args.masterId, args.mbaNumber, userId])

  const persistServer = useCallback(async () => {
    if (!enabled || args.masterId == null || !userId) return
    const state = getSnapshotRef.current()
    setPayloadBytes(estimateDraftPayloadBytes(state))
    await fetch("/api/plans/drafts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterId: args.masterId,
        baseVersionId: args.baseVersionId,
        state,
      }),
    })
    await clearLocalDraft({
      masterId: args.masterId,
      mbaNumber: args.mbaNumber,
      userId,
    })
    setLastAutosaveAt(Date.now())
  }, [enabled, args.masterId, args.mbaNumber, userId, args.baseVersionId])

  // Tier 1 ~3s after dirty
  useEffect(() => {
    if (!enabled || !args.dirty) return
    if (localTimer.current) clearTimeout(localTimer.current)
    localTimer.current = setTimeout(() => {
      void persistLocal()
    }, 3000)
    return () => {
      if (localTimer.current) clearTimeout(localTimer.current)
    }
  }, [enabled, args.dirty, persistLocal])

  // Tier 2 ~15s + blur
  useEffect(() => {
    if (!enabled || !args.dirty || args.masterId == null) return
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
  }, [enabled, args.dirty, args.masterId, persistServer])

  // On mount: offer recovery + other editors
  useEffect(() => {
    if (!enabled || !userId) return
    let cancelled = false
    ;(async () => {
      const local = await readLocalDraft({
        masterId: args.masterId,
        mbaNumber: args.mbaNumber,
        userId,
      })
      let server: { updatedAt: string; state: PlanDraftStateV1 } | null = null
      let otherList: OtherDraft[] = []
      if (args.masterId != null) {
        const res = await fetch(`/api/plans/drafts?masterId=${args.masterId}`)
        if (res.ok) {
          const json = (await res.json()) as {
            draft?: { updatedAt: string; draftStateJson: PlanDraftStateV1 } | null
            others?: OtherDraft[]
          }
          if (json.draft) {
            server = {
              updatedAt: json.draft.updatedAt,
              state: json.draft.draftStateJson,
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
      if (pick.winner === "none") return
      const state = pick.winner === "local" ? local!.state : server!.state
      const updatedAt = pick.winner === "local" ? local!.updatedAt : server!.updatedAt
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
      setRecovery({
        source: pick.winner,
        reason: pick.reason,
        summary: summarizeDraftOffer({
          updatedAt,
          linesChanged: cmp.linesChanged || Math.max(0, state.meta.lineCount),
          budgetDeltaDollars: cmp.budgetDeltaCents / 100,
        }),
        state,
        updatedAt,
      })
    })().catch((err) => console.warn("[PC7] recovery probe failed", err))
    return () => {
      cancelled = true
    }
  }, [enabled, args.masterId, args.mbaNumber, userId])

  const discard = useCallback(async () => {
    if (!userId) return
    await clearLocalDraft({
      masterId: args.masterId,
      mbaNumber: args.mbaNumber,
      userId,
    })
    if (args.masterId != null) {
      await fetch(`/api/plans/drafts?masterId=${args.masterId}`, { method: "DELETE" })
    }
    setRecovery(null)
    setLastAutosaveAt(null)
  }, [args.masterId, args.mbaNumber, userId])

  const resume = useCallback(() => {
    if (!recovery) return
    args.onRestore(recovery.state)
    setRecovery(null)
  }, [recovery, args])

  const saveDraftNow = useCallback(async () => {
    await persistLocal()
    await persistServer()
  }, [persistLocal, persistServer])

  const clearAfterPublish = useCallback(async () => {
    await discard()
  }, [discard])

  return {
    enabled,
    pill,
    recovery,
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
