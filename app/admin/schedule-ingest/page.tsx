"use client"

import { Suspense, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { useSearchParams } from "next/navigation"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IngestReviewScreen } from "@/components/ingest/IngestReviewScreen"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  isConstantMappingHeader,
  fieldIdFromConstantHeader,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"
import {
  shouldCallAvaForMappings,
  type AvaColumnMappingProposal,
} from "@/lib/mediaplans/ingest/avaColumnMapping"
import { readIngestStageFromSession } from "@/lib/mediaplans/ingest/ingestStageClient"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"
import { LoadingState } from "@/components/ui/states"
import type { Publisher } from "@/lib/types/publisher"

async function loadAvaMappingSuggestions(
  review: IngestReviewPackage,
  setReview: Dispatch<SetStateAction<IngestReviewPackage | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  if (review.needs_catalogue_choice) return
  const columns = review.unmapped_column_samples ?? []
  const leftoverHeaders = (review.template_coverage?.not_used ?? []).map(
    (n) => n.header,
  )
  const unmatchedRequired =
    review.template_coverage?.required.filter((f) => !f.matched) ?? []
  if (
    !shouldCallAvaForMappings({
      unmatchedRequired,
      leftoverHeaders:
        leftoverHeaders.length > 0 ? leftoverHeaders : columns.map((c) => c.header),
    })
  ) {
    return
  }
  try {
    const res = await fetch("/api/admin/ingest/ava-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publisherName: review.detected_publisher,
        publisherConfidence: review.publisher_confidence,
        unmatchedRequired,
        leftoverHeaders:
          leftoverHeaders.length > 0
            ? leftoverHeaders
            : columns.map((c) => c.header),
        columns,
      }),
    })
    const json = (await res.json()) as {
      proposals?: AvaColumnMappingProposal[]
      ava_call_count?: number
      error?: string
    }
    if (!res.ok) {
      throw new Error(json.error || `HTTP ${res.status}`)
    }
    setReview((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        ava_mapping_proposals: json.proposals ?? [],
        ava_call_count: json.ava_call_count ?? 0,
      }
    })
  } catch (e) {
    setError(e instanceof Error ? e.message : "AVA mapping failed")
  }
}

function ScheduleIngestPageInner() {
  const pageLabel =
    getRouteByExactPath("/admin/schedule-ingest")?.label ?? "Schedule ingest"
  const searchParams = useSearchParams()
  const stageId = searchParams.get("stage")?.trim() || ""

  const [review, setReview] = useState<IngestReviewPackage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [remapping, setRemapping] = useState(false)
  const [masterId, setMasterId] = useState("")
  const [mbaNumber, setMbaNumber] = useState("")
  const [versionNumber, setVersionNumber] = useState("1")
  const [acceptMsg, setAcceptMsg] = useState<string | null>(null)
  const [catalogue, setCatalogue] = useState<Publisher[]>([])
  const [pickedPublisherId, setPickedPublisherId] = useState("")
  const [linking, setLinking] = useState(false)
  const fileRef = useRef<File | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/publishers?full=1")
        if (!res.ok) return
        const json = (await res.json()) as Publisher[] | { data?: Publisher[] }
        const rows = Array.isArray(json) ? json : (json.data ?? [])
        if (!cancelled) setCatalogue(rows)
      } catch {
        // picker stays empty; user can retry by reloading
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!stageId) return
    let cancelled = false
    const fromSession = readIngestStageFromSession(stageId)
    if (fromSession?.review) {
      setReview(fromSession.review)
      void loadAvaMappingSuggestions(fromSession.review, setReview, setError)
      return
    }
    setUploading(true)
    void fetch(`/api/admin/ingest/stage/${encodeURIComponent(stageId)}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          review?: IngestReviewPackage
          error?: string
        }
        if (!res.ok || !json.review) {
          throw new Error(json.error || `HTTP ${res.status}`)
        }
        if (!cancelled) {
          setReview(json.review)
          void loadAvaMappingSuggestions(json.review, setReview, setError)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Staged ingest not found")
        }
      })
      .finally(() => {
        if (!cancelled) setUploading(false)
      })
    return () => {
      cancelled = true
    }
  }, [stageId])

  const onUpload = useCallback(async (file: File) => {
    fileRef.current = file
    setUploading(true)
    setError(null)
    setAcceptMsg(null)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await fetch("/api/admin/ingest/review", {
        method: "POST",
        body: fd,
      })
      const json = (await res.json()) as {
        review?: IngestReviewPackage
        error?: string
      }
      if (!res.ok || !json.review) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      setReview(json.review)
      void loadAvaMappingSuggestions(json.review, setReview, setError)
    } catch (e) {
      setReview(null)
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }, [])

  const onRemap = useCallback(
    async (header: string, mappedTo: string | null) => {
      if (!review?.detected_publisher) return
      setRemapping(true)
      setError(null)
      try {
        const constant = isConstantMappingHeader(header)
        const res = await fetch("/api/admin/ingest/remap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publisherName: review.detected_publisher,
            header,
            mappedTo,
            ...(constant
              ? {}
              : { knownHeaders: review.column_mapping.map((c) => c.header) }),
          }),
        })
        const json = (await res.json()) as {
          error?: string
          ok?: boolean
          reason?: string
        }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        if (json.ok === false) {
          throw new Error(json.reason || "That header is not a column in this schedule")
        }

        setReview((prev) => {
          if (!prev) return prev
          if (isConstantMappingHeader(header)) {
            const fieldId = fieldIdFromConstantHeader(header)
            const nextDefaults = { ...(prev.profile?.field_defaults ?? {}) }
            if (mappedTo == null) delete nextDefaults[fieldId]
            const mark = (
              f: NonNullable<typeof prev.template_coverage>["required"][number],
            ) => {
              if (f.id !== fieldId) return f
              if (mappedTo != null) return f
              if (f.source.kind !== "constant") return f
              return {
                ...f,
                matched: false,
                source: { kind: "unmatched" as const },
                confidence: 0,
              }
            }
            const required = prev.template_coverage?.required.map(mark)
            const enrich = prev.template_coverage?.enrich.map(mark)
            return {
              ...prev,
              profile: prev.profile
                ? { ...prev.profile, field_defaults: nextDefaults }
                : prev.profile,
              template_coverage: prev.template_coverage
                ? {
                    ...prev.template_coverage,
                    required: required ?? prev.template_coverage.required,
                    enrich: enrich ?? prev.template_coverage.enrich,
                    required_matched: (
                      required ?? prev.template_coverage.required
                    ).filter((f) => f.matched).length,
                  }
                : prev.template_coverage,
            }
          }
          const mark = (f: NonNullable<typeof prev.template_coverage>["required"][number]) => {
            if (f.matched || mappedTo == null) return f
            if (
              f.canonicals?.includes(mappedTo) ||
              f.dest === mappedTo
            ) {
              return {
                ...f,
                matched: true,
                source: { kind: "header" as const, header },
              }
            }
            return f
          }
          const required = prev.template_coverage?.required.map(mark)
          const enrich = prev.template_coverage?.enrich.map(mark)
          return {
            ...prev,
            column_mapping: prev.column_mapping.map((c) =>
              c.header === header
                ? {
                    header: c.header,
                    mapped_to: mappedTo,
                    unmapped: mappedTo == null,
                    sheetName: c.sheetName,
                  }
                : c,
            ),
            ava_mapping_proposals: (prev.ava_mapping_proposals ?? []).filter(
              (p) =>
                p.header.replace(/\s+/g, " ").trim().toLowerCase() !==
                header.replace(/\s+/g, " ").trim().toLowerCase(),
            ),
            template_coverage: prev.template_coverage
              ? {
                  ...prev.template_coverage,
                  required: required ?? prev.template_coverage.required,
                  enrich: enrich ?? prev.template_coverage.enrich,
                  required_matched: (required ?? prev.template_coverage.required).filter(
                    (f) => f.matched,
                  ).length,
                  not_used: prev.template_coverage.not_used.filter(
                    (n) =>
                      n.header.replace(/\s+/g, " ").trim().toLowerCase() !==
                      header.replace(/\s+/g, " ").trim().toLowerCase(),
                  ),
                }
              : prev.template_coverage,
          }
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Remap failed")
      } finally {
        setRemapping(false)
      }
    },
    [review],
  )

  const onAcceptAvaProposal = useCallback(
    async (proposal: {
      header: string
      proposed_mapped_to: string | null
    }) => {
      await onRemap(proposal.header, proposal.proposed_mapped_to)
    },
    [onRemap],
  )

  const onAccept = useCallback(async () => {
    if (!review?.proposal) return
    const mid = Number(masterId)
    if (!Number.isFinite(mid) || mid <= 0 || !mbaNumber.trim()) {
      setError("Enter masterId and mbaNumber before Accept")
      return
    }
    setAccepting(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/ingest/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: review.proposal,
          masterId: mid,
          mbaNumber: mbaNumber.trim(),
          versionNumber: Number(versionNumber) || 1,
          mode: "draft",
          fileName: review.source_file_name,
          detectedConfidence: review.publisher_confidence,
          stageId: stageId || undefined,
        }),
      })
      const json = (await res.json()) as {
        error?: string
        lineCount?: number
        panelCount?: number
        preferOohExpertView?: boolean
        oohPanelLineCount?: number
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      if (json.preferOohExpertView) {
        const { writeIngestOohExpertPreference } = await import(
          "@/lib/mediaplans/ingest/oohLargeFormatExpertGate"
        )
        writeIngestOohExpertPreference(true)
      }
      setAcceptMsg(
        `Accepted: ${json.lineCount} line items, ${json.panelCount} panels` +
          (json.preferOohExpertView
            ? ` · OOH will open in expert view (${json.oohPanelLineCount} panel lines).`
            : "."),
      )
      setReview(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed")
    } finally {
      setAccepting(false)
    }
  }, [review, masterId, mbaNumber, versionNumber])

  const onCancel = useCallback(async () => {
    if (review) {
      try {
        await fetch("/api/admin/ingest/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publisherName: review.detected_publisher,
            fileName: review.source_file_name,
            detectedConfidence: review.publisher_confidence,
            requiredCoverage: review.template_coverage?.completeness ?? null,
            lineItemCount: review.proposal?.reconciliation.line_item_count ?? 0,
            panelCount: review.proposal?.reconciliation.panel_count ?? 0,
            burstCount: review.proposal?.reconciliation.burst_count ?? 0,
            moneyDelta:
              review.proposal?.reconciliation.delta_pct ??
              review.proposal?.reconciliation.delta ??
              null,
          }),
        })
      } catch {
        // history write is best-effort; still close the review
      }
    }
    setReview(null)
    setAcceptMsg("Cancelled — ingest run recorded, plan not saved.")
    setError(null)
  }, [review])

  const onLinkPublisher = useCallback(async () => {
    const picked = catalogue.find((p) => String(p.id) === pickedPublisherId)
    const file = fileRef.current
    if (!picked || !file) {
      setError("Pick a catalogue publisher, then continue.")
      return
    }
    setLinking(true)
    setError(null)
    try {
      const linkRes = await fetch("/api/admin/ingest/link-publisher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: picked.id,
          publisher_name: picked.publisher_name,
          publisherid: picked.publisherid,
          pub_ooh: picked.pub_ooh,
          pub_radio: picked.pub_radio,
        }),
      })
      const linkJson = (await linkRes.json()) as {
        profile?: { publisher_name: string }
        error?: string
      }
      if (!linkRes.ok || !linkJson.profile) {
        throw new Error(linkJson.error || `HTTP ${linkRes.status}`)
      }
      const fd = new FormData()
      fd.set("file", file)
      fd.set("publisherName", linkJson.profile.publisher_name)
      const res = await fetch("/api/admin/ingest/review", {
        method: "POST",
        body: fd,
      })
      const json = (await res.json()) as {
        review?: IngestReviewPackage
        error?: string
      }
      if (!res.ok || !json.review) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      setReview(json.review)
      void loadAvaMappingSuggestions(json.review, setReview, setError)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link failed")
    } finally {
      setLinking(false)
    }
  }, [catalogue, pickedPublisherId])

  if (review?.needs_catalogue_choice) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 p-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Unknown publisher
          </h1>
          <p className="text-sm text-muted-foreground">
            This file did not match an ingest profile. Pick the catalogue
            publisher to link — we never guess.
            {review.source_file_name ? (
              <>
                {" "}
                File:{" "}
                <span className="font-medium text-foreground">
                  {review.source_file_name}
                </span>
              </>
            ) : null}
          </p>
        </header>
        {error ? (
          <div className="rounded-card border border-border bg-card px-4 py-3 text-sm text-status-critical-fg shadow-e1">
            {error}
          </div>
        ) : null}
        <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Catalogue publisher</span>
            <select
              className="h-10 w-full rounded-input border border-border bg-background px-3 text-sm"
              value={pickedPublisherId}
              onChange={(e) => setPickedPublisherId(e.target.value)}
            >
              <option value="">Select…</option>
              {catalogue
                .slice()
                .sort((a, b) =>
                  a.publisher_name.localeCompare(b.publisher_name),
                )
                .map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.publisher_name}
                    {p.publisherid ? ` (${p.publisherid})` : ""}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => void onLinkPublisher()}
              disabled={linking || !pickedPublisherId}
            >
              Link and continue
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onCancel()}
              disabled={linking}
            >
              Cancel
            </Button>
          </div>
        </section>
      </div>
    )
  }

  if (review) {
    return (
      <>
        {error ? (
          <div className="mx-auto w-full max-w-[1200px] px-6 pt-6">
            <div className="rounded-card border border-border bg-card px-4 py-3 text-sm text-status-critical-fg shadow-e1">
              {error}
            </div>
          </div>
        ) : null}
        <IngestReviewScreen
          review={review}
          onRemap={onRemap}
          onAcceptAvaProposal={onAcceptAvaProposal}
          onAccept={onAccept}
          onCancel={onCancel}
          accepting={accepting}
          remapping={remapping}
          campaignHint={`Target MBA ${mbaNumber || "?"} · master ${masterId || "?"} · v${versionNumber || "1"}`}
        />
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {pageLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload a publisher workbook. You will confirm every mapping before
          anything is saved.
        </p>
      </header>

      {error ? (
        <div className="rounded-card border border-border bg-card px-4 py-3 text-sm text-status-critical-fg shadow-e1">
          {error}
        </div>
      ) : null}
      {acceptMsg ? (
        <div className="rounded-card border border-border bg-card px-4 py-3 text-sm text-foreground shadow-e1">
          {acceptMsg}
        </div>
      ) : null}

      <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
        <h2 className="text-sm font-semibold text-foreground">
          Campaign target
        </h2>
        <p className="text-xs text-muted-foreground">
          Accept writes through the normal save path against this master.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">masterId</span>
            <Input
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">mbaNumber</span>
            <Input
              value={mbaNumber}
              onChange={(e) => setMbaNumber(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">versionNumber</span>
            <Input
              value={versionNumber}
              onChange={(e) => setVersionNumber(e.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-card border border-border bg-card p-4 shadow-e1">
        <h2 className="text-sm font-semibold text-foreground">Upload</h2>
        <Input
          type="file"
          accept=".xlsx,.xlsm"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onUpload(f)
          }}
        />
        {uploading ? <LoadingState /> : null}
        <Button type="button" variant="outline" disabled>
          Accept is only available after review — never auto
        </Button>
      </section>
    </div>
  )
}

export default function ScheduleIngestPage() {
  return (
    <AdminGuard>
      <Suspense fallback={<LoadingState />}>
        <ScheduleIngestPageInner />
      </Suspense>
    </AdminGuard>
  )
}
