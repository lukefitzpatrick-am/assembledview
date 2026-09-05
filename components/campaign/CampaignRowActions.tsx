"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"

import { SplitActionButton } from "@/components/mediaplans/SplitActionButton"
import type { PublishedDocumentsPayload } from "@/lib/docs/planVersionFiles"
import { cn } from "@/lib/utils"

export type CampaignRowActionsProps = {
  mbaNumber: string
  versionNumber: number
  clientSlug: string
  canEdit: boolean
  layout: "stacked" | "columns"
}

const documentsCache = new Map<string, Promise<PublishedDocumentsPayload>>()

export function resetCampaignDocumentsCacheForTests() {
  documentsCache.clear()
}

function cacheKey(mbaNumber: string): string {
  return mbaNumber.trim().toLowerCase()
}

function fetchCampaignDocuments(mbaNumber: string): Promise<PublishedDocumentsPayload> {
  const key = cacheKey(mbaNumber)
  const existing = documentsCache.get(key)
  if (existing) return existing
  const request = fetch(`/api/mediaplans/mba/${encodeURIComponent(mbaNumber)}/documents`).then(
    async (res) => {
      if (!res.ok) throw new Error(`documents ${res.status}`)
      return (await res.json()) as PublishedDocumentsPayload
    },
  )
  const guarded = request.catch((err) => {
    documentsCache.delete(key)
    throw err
  })
  documentsCache.set(key, guarded)
  return guarded
}

function formatSavedDay(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Melbourne",
  }).format(new Date(iso))
}

function savedAtFromPayload(payload: PublishedDocumentsPayload): string | null {
  return (
    payload.files.mba_pdf?.savedAt ??
    payload.files.media_plan?.savedAt ??
    payload.files.aa_media_plan?.savedAt ??
    payload.publishedAt
  )
}

const FILE_ROWS: Array<{
  kind: "mba_pdf" | "media_plan" | "aa_media_plan"
  label: string
}> = [
  { kind: "mba_pdf", label: "MBA (PDF)" },
  { kind: "media_plan", label: "Media plan (XLSX)" },
  { kind: "aa_media_plan", label: "AA media plan (XLSX)" },
]

export function CampaignRowActions({
  mbaNumber,
  versionNumber,
  clientSlug,
  canEdit,
  layout,
}: CampaignRowActionsProps) {
  const router = useRouter()
  const [docs, setDocs] = useState<PublishedDocumentsPayload | null>(null)
  const unpublished = docs != null && docs.publishedVersionId == null
  const downloadDisabled = unpublished
  const size = layout === "columns" ? "card" : "row"

  const loadDocuments = useCallback(
    (open: boolean) => {
      if (!open) return
      void fetchCampaignDocuments(mbaNumber)
        .then((payload) => {
          setDocs(payload)
        })
        .catch(() => {
          setDocs({
            publishedVersionId: null,
            versionNumber: null,
            publishedAt: null,
            files: { mba_pdf: null, media_plan: null, aa_media_plan: null },
          })
        })
    },
    [mbaNumber],
  )

  const publishedLabel = docs?.versionNumber ?? versionNumber
  const savedIso = docs ? savedAtFromPayload(docs) : null
  const menuHeader =
    docs && docs.publishedVersionId != null
      ? `Published v${publishedLabel}${savedIso ? ` · saved ${formatSavedDay(savedIso)}` : ""}`
      : undefined

  const downloadMenu =
    docs && docs.publishedVersionId != null
      ? FILE_ROWS.map((row) => {
          const file = docs.files[row.kind]
          const missing = file == null
          return {
            label: row.label,
            hint: missing ? `not saved for v${publishedLabel}` : undefined,
            disabled: missing,
            onSelect: () => {
              if (missing || docs.publishedVersionId == null) return
              window.location.assign(
                `/api/mediaplans/${docs.publishedVersionId}/download?kind=${row.kind}`,
              )
            },
          }
        })
      : [{ label: "Loading…", disabled: true, onSelect: () => {} }]

  const noDashboard = !clientSlug
  const openMenu = [
    {
      label: "View campaign",
      hint: noDashboard ? "No client dashboard" : undefined,
      disabled: noDashboard,
      onSelect: () => {
        if (noDashboard) return
        router.push(`/dashboard/${clientSlug}/${mbaNumber}`)
      },
    },
    ...(canEdit
      ? [
          {
            label: `Edit media plan · v${versionNumber}`,
            onSelect: () => {
              router.push(`/mediaplans/mba/${mbaNumber}/edit?version=${versionNumber}`)
            },
          },
        ]
      : []),
  ]

  return (
    <div
      className={cn(
        layout === "stacked"
          ? "flex w-full min-w-[9.5rem] flex-col gap-1.5"
          : "grid w-full grid-cols-2 gap-2",
      )}
    >
      <SplitActionButton
        label="Open"
        variant="outline"
        size={size}
        fullWidth
        hintPlacement="end"
        menuSide="bottom"
        menuAlign="start"
        menuMatchTriggerWidth
        menuOnly
        menu={openMenu}
      />
      <SplitActionButton
        label="Download"
        variant="outline"
        size={size}
        fullWidth
        hintPlacement="end"
        menuSide="bottom"
        menuAlign="start"
        menuMatchTriggerWidth
        menuOnly
        disabled={downloadDisabled}
        title={downloadDisabled ? "No published version" : undefined}
        menuHeader={menuHeader}
        onMenuOpenChange={loadDocuments}
        menu={downloadMenu}
      />
    </div>
  )
}
