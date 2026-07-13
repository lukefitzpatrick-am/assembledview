"use client"

import { useState } from "react"
import { createRoot } from "react-dom/client"
import { Loader2 } from "lucide-react"

import { captureNodePng } from "@/components/charts/system"
import { OutcomeCharts, topDfiiLabel } from "@/components/planning/OutcomeCharts"
import { RecommendedSplitBlock } from "@/components/planning/RecommendedSplitBlock"
import { formatAudienceWc, robustnessFromN } from "@/components/planning/robustness"
import type { AudienceCompareBundle } from "@/components/planning/StageCompare"
import type {
  BriefState,
  DiagnosisState,
  AudienceDraft,
} from "@/components/planning/store"
import {
  effectiveSegmentId,
  isBaseSegmentLens,
} from "@/components/planning/store"
import { generateAudienceInsight } from "@/components/planning/useAudienceInsight"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import type { PlanningSegment } from "@/lib/planning/types"

type ExportDeckButtonProps = {
  brief: BriefState
  diagnosis: DiagnosisState
  waveLabel: string
  reachBasis: string
  bundles: AudienceCompareBundle[]
  excludedChannelIds: string[]
  channelNamesById: Record<string, string>
  insightByAudienceId: Record<string, string | null>
  insightFor: (draftId: string) => { cacheKey: string; cachedInsight: string | null }
  onInsight: (cacheKey: string, text: string) => void
  segments: PlanningSegment[]
  showDollars: boolean
}

function waitFrames(n = 2) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })
}

function definitionLine(draft: AudienceDraft, segments: PlanningSegment[]) {
  const lens = isBaseSegmentLens(draft.segmentId)
    ? "All People"
    : segments.find((s) => s.segment_id === draft.segmentId)?.name ?? draft.segmentId
  const states = draft.states.join("+")
  const ages = draft.ageBands.join(", ")
  return `${states} · ${draft.gender} · ${ages} · ${draft.reachBasis} · ${lens}`
}

function statsLine(bundle: AudienceCompareBundle) {
  const a = bundle.adapted
  if (!a) return "No live composition"
  const rob = robustnessFromN(a.unweightedN)
  const pct =
    a.universeWc > 0 ? ((a.audienceWc / a.universeWc) * 100).toFixed(1) : "—"
  return `Size ${formatAudienceWc(a.audienceWc)} '000s · ${pct}% of 14+ · n ${a.unweightedN} · ${rob.label}`
}

function topMixLine(bundle: AudienceCompareBundle) {
  return bundle.allocated
    .slice(0, 5)
    .map((a) => `${a.ch.name} ${Math.round(a.pct)}%`)
    .join(" · ")
}

function topAffinityFallback(bundle: AudienceCompareBundle) {
  const seg = effectiveSegmentId(bundle.draft.segmentId)
  return [...(bundle.adapted?.channels ?? [])]
    .map((ch) => ({
      name: ch.name,
      aff: ch.aff[seg] ?? 100,
      reach: Math.round(ch.reachPct * 100),
    }))
    .sort((a, b) => b.aff - a.aff)
    .slice(0, 5)
    .map((c) => `${c.name} ${Math.round(c.aff)} (reach ${c.reach}%)`)
    .join(" · ")
}

type CapturedExportPng = {
  dataUrl: string | null
  width: number | null
  height: number | null
}

async function mountAndCapture(
  node: React.ReactNode,
  selectors: string[]
): Promise<Record<string, CapturedExportPng>> {
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1200px;pointer-events:none;opacity:1;z-index:-1;background:#fff;"
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  await waitFrames(2)
  await new Promise((r) => setTimeout(r, 400))

  const out: Record<string, CapturedExportPng> = {}
  for (const sel of selectors) {
    const el = host.querySelector(sel) as HTMLElement | null
    try {
      const captured = await captureNodePng(el)
      out[sel] = captured
        ? {
            dataUrl: captured.dataUrl,
            width: captured.width,
            height: captured.height,
          }
        : { dataUrl: null, width: null, height: null }
    } catch {
      out[sel] = { dataUrl: null, width: null, height: null }
    }
  }

  root.unmount()
  host.remove()
  return out
}

export function ExportDeckButton({
  brief,
  diagnosis,
  waveLabel,
  reachBasis,
  bundles,
  excludedChannelIds,
  channelNamesById,
  insightByAudienceId,
  insightFor,
  onInsight,
  segments,
  showDollars,
}: ExportDeckButtonProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [showMissingHint, setShowMissingHint] = useState(false)
  const [generatingMissing, setGeneratingMissing] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const ready = bundles.every((b) => b.adapted && b.scored.length > 0)

  const missingBundles = bundles.filter((b) => {
    const cached = insightFor(b.draft.id).cachedInsight
    return !cached?.trim()
  })
  const missingCount = missingBundles.length
  const totalCount = bundles.length

  async function runExport(
    insightOverrides?: Record<string, string | null>
  ) {
    if (!ready || busy) return
    setBusy(true)
    setShowMissingHint(false)
    setGenerateError(null)
    try {
      const audiencesPayload: Array<{
        name: string
        definition: string
        stats: string
        insight: string | null
        topMix: string
        topDfii: string
        charts: {
          reachIndexPng: string | null
          reachIndexPngWidth: number | null
          reachIndexPngHeight: number | null
          quadrantPng: string | null
          quadrantPngWidth: number | null
          quadrantPngHeight: number | null
          dfiiPng: string | null
          dfiiPngWidth: number | null
          dfiiPngHeight: number | null
        }
      }> = []

      for (let i = 0; i < bundles.length; i++) {
        const b = bundles[i]!
        const captured = await mountAndCapture(
          <OutcomeCharts bundles={[b]} />,
          [
            '[data-export="reach-index"]',
            '[data-export="reach-index-quadrant"]',
            '[data-export="dfii-ranked"]',
          ]
        )
        const reach = captured['[data-export="reach-index"]']
        const quadrant = captured['[data-export="reach-index-quadrant"]']
        const dfii = captured['[data-export="dfii-ranked"]']
        const insight =
          insightOverrides?.[b.draft.id] ??
          insightByAudienceId[b.draft.id] ??
          insightFor(b.draft.id).cachedInsight ??
          null
        audiencesPayload.push({
          name: b.draft.name,
          definition: definitionLine(b.draft, segments),
          stats: statsLine(b),
          insight,
          topMix: topMixLine(b) || topAffinityFallback(b),
          topDfii: topDfiiLabel(b.scored) ?? "—",
          charts: {
            reachIndexPng: reach?.dataUrl ?? null,
            reachIndexPngWidth: reach?.width ?? null,
            reachIndexPngHeight: reach?.height ?? null,
            quadrantPng: i === 0 ? (quadrant?.dataUrl ?? null) : null,
            quadrantPngWidth: i === 0 ? (quadrant?.width ?? null) : null,
            quadrantPngHeight: i === 0 ? (quadrant?.height ?? null) : null,
            dfiiPng: i === 0 ? (dfii?.dataUrl ?? null) : null,
            dfiiPngWidth: i === 0 ? (dfii?.width ?? null) : null,
            dfiiPngHeight: i === 0 ? (dfii?.height ?? null) : null,
          },
        })
      }

      const splitCap = await mountAndCapture(
        <RecommendedSplitBlock bundles={bundles} showDollars={showDollars} />,
        ['[data-export="recommended-split"]']
      )
      const split = splitCap['[data-export="recommended-split"]']

      const includedCount = Object.keys(channelNamesById).filter(
        (id) => !excludedChannelIds.includes(id)
      ).length
      const excludedNames = excludedChannelIds
        .map((id) => channelNamesById[id] || id)
        .filter(Boolean)

      const res = await fetch("/api/planning/export-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: {
            clientName: brief.clientName || undefined,
            campaignName: brief.brandOverride || brief.clientName || undefined,
            category: brief.category || undefined,
            market: "Australia",
            objectiveKind: brief.objectiveKind || undefined,
            budget: brief.budget || undefined,
            startDate: brief.startDate,
            endDate: brief.endDate,
          },
          diagnosis: {
            penetrationPct: diagnosis.penetration,
            targetPct: diagnosis.target,
            salience: diagnosis.salience,
            createCapture: diagnosis.createCapture,
          },
          constraintsSummary: { includedCount, excludedNames },
          waveLabel,
          reachBasis,
          audiences: audiencesPayload,
          splitTablePng: split?.dataUrl ?? null,
          splitTablePngWidth: split?.width ?? null,
          splitTablePngHeight: split?.height ?? null,
          generatedAtLabel: new Date().toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string
          error?: string
        } | null
        throw new Error(data?.message || data?.error || `Export failed (${res.status})`)
      }

      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") || ""
      const match = /filename="([^"]+)"/.exec(cd)
      const filename = match?.[1] || "demand-flow-plan.pptx"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      toast({ title: "Deck exported", description: filename })
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
      setGeneratingMissing(false)
    }
  }

  function handleExportClick() {
    if (!ready || busy) return
    if (missingCount > 0) {
      setShowMissingHint(true)
      setGenerateError(null)
      return
    }
    void runExport()
  }

  async function handleGenerateAllMissing() {
    if (generatingMissing || busy) return
    setGeneratingMissing(true)
    setGenerateError(null)
    const overrides: Record<string, string | null> = {}
    try {
      for (const b of missingBundles) {
        if (!b.adapted) {
          throw new Error(`“${b.draft.name}” has no live composition yet`)
        }
        const { cacheKey } = insightFor(b.draft.id)
        const text = await generateAudienceInsight({
          draft: b.draft,
          adapted: b.adapted,
          scored: b.scored,
          brief,
          waveLabel,
          segments,
        })
        onInsight(cacheKey, text)
        overrides[b.draft.id] = text
      }
      await runExport({
        ...Object.fromEntries(
          bundles.map((b) => [
            b.draft.id,
            overrides[b.draft.id] ??
              insightFor(b.draft.id).cachedInsight ??
              null,
          ])
        ),
      })
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate missing insights"
      )
      setGeneratingMissing(false)
    }
  }

  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!ready || busy || generatingMissing}
        onClick={handleExportClick}
      >
        {busy ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            Exporting…
          </>
        ) : (
          "Export deck (.pptx)"
        )}
      </Button>

      {showMissingHint && missingCount > 0 ? (
        <div className="w-full rounded-input border border-border bg-card px-3 py-2.5 text-left shadow-e1">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {missingCount} of {totalCount} audiences have no generated insight — export
            will use the affinity fallback.
          </p>
          {generateError ? (
            <div className="mt-2 rounded-input border border-border bg-pacing-critical-bg px-2.5 py-1.5 text-xs text-status-critical-fg">
              {generateError}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || generatingMissing}
              onClick={() => void runExport()}
            >
              Export anyway
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || generatingMissing}
              onClick={() => void handleGenerateAllMissing()}
            >
              {generatingMissing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate all missing"
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
