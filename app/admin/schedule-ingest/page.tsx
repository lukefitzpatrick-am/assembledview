"use client"

import { Suspense, useCallback, useState, type Dispatch, type SetStateAction } from "react"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { IngestReviewScreen } from "@/components/ingest/IngestReviewScreen"
import type { IngestReviewPackage } from "@/lib/mediaplans/ingest/buildIngestReview"
import {
  shouldCallAvaForMappings,
  type AvaColumnMappingProposal,
} from "@/lib/mediaplans/ingest/avaColumnMapping"
import { getRouteByExactPath } from "@/lib/nav/routeManifest"
import { LoadingState } from "@/components/ui/states"

async function loadAvaMappingSuggestions(
  review: IngestReviewPackage,
  setReview: Dispatch<SetStateAction<IngestReviewPackage | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const columns = review.unmapped_column_samples ?? []
  const unmappedHeaders = columns.map((c) => c.header)
  if (
    !shouldCallAvaForMappings({
      publisherConfidence: review.publisher_confidence,
      unmappedHeaders,
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

  const [review, setReview] = useState<IngestReviewPackage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [remapping, setRemapping] = useState(false)
  const [masterId, setMasterId] = useState("")
  const [mbaNumber, setMbaNumber] = useState("")
  const [versionNumber, setVersionNumber] = useState("1")
  const [acceptMsg, setAcceptMsg] = useState<string | null>(null)

  const onUpload = useCallback(async (file: File) => {
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
        const res = await fetch("/api/admin/ingest/remap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publisherName: review.detected_publisher,
            header,
            mappedTo,
          }),
        })
        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

        setReview((prev) => {
          if (!prev) return prev
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
          }
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Remap failed")
      } finally {
        setRemapping(false)
      }
    },
    [review?.detected_publisher],
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

  const onCancel = useCallback(() => {
    setReview(null)
    setAcceptMsg("Cancelled — nothing written.")
    setError(null)
  }, [])

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
