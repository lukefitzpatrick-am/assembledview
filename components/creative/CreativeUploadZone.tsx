"use client"

import { useCallback, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { Loader2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { cn } from "@/lib/utils"
import {
  ACCEPTED_CREATIVE_MIME_PREFIXES,
  extractAssetDimensions,
  formatFileSize,
  isAcceptedCreativeFile,
} from "@/lib/creative/metadata"
import type { LineItemOption } from "@/lib/creative/lineItemOptions"
import type { CreativeAsset } from "@/lib/creative/types"

export type UploadQueueItem = {
  id: string
  file: File
  status: "pending" | "uploading" | "registering" | "done" | "error"
  progress: number
  loaded: number
  total: number
  error?: string
}

const CLEAR_DONE_DELAY_MS = 1600

type CreativeUploadZoneProps = {
  mbaNumber: string
  mediaPlanMasterId: number
  lineItemLink: Pick<LineItemOption, "line_item_id" | "source_table"> | null
  disabled?: boolean
  onAssetRegistered: (asset: CreativeAsset) => void
  onError: (message: string) => void
}

function acceptAttribute(): string {
  const prefixes = ACCEPTED_CREATIVE_MIME_PREFIXES.map((p) => `${p}*`).join(",")
  return `${prefixes},application/pdf,application/zip`
}

export function CreativeUploadZone({
  mbaNumber,
  mediaPlanMasterId,
  lineItemLink,
  disabled,
  onAssetRegistered,
  onError,
}: CreativeUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [queue, setQueue] = useState<UploadQueueItem[]>([])

  const updateQueueItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const registerAsset = useCallback(
    async (
      file: File,
      blob: { url: string; pathname: string; contentType?: string },
      dimensions: Awaited<ReturnType<typeof extractAssetDimensions>>,
    ): Promise<CreativeAsset> => {
      const payload = {
        mba_number: mbaNumber,
        media_plan_master_id: mediaPlanMasterId,
        line_item_id: lineItemLink?.line_item_id ?? "",
        source_table: lineItemLink?.source_table ?? "",
        asset_name: file.name,
        original_filename: file.name,
        mime_type: blob.contentType || file.type || "application/octet-stream",
        file_size_bytes: file.size,
        width_px: dimensions.width_px,
        height_px: dimensions.height_px,
        duration_seconds: dimensions.duration_seconds,
        blob_url: blob.url,
        blob_pathname: blob.pathname,
        status: "active" as const,
      }

      const response = await fetch("/api/creative-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || "Failed to register asset")
      }

      const row = (await response.json()) as CreativeAsset
      const needsDimensionPatch =
        row.media_plan_master_id === 0 ||
        dimensions.width_px > 0 ||
        dimensions.height_px > 0 ||
        dimensions.duration_seconds > 0

      if (needsDimensionPatch && row.id) {
        const patchResponse = await fetch(`/api/creative-assets/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            width_px: dimensions.width_px,
            height_px: dimensions.height_px,
            duration_seconds: dimensions.duration_seconds,
          }),
        })
        if (!patchResponse.ok) {
          const data = (await patchResponse.json().catch(() => null)) as { error?: string } | null
          throw new Error(data?.error || "Failed to update asset metadata")
        }
        return (await patchResponse.json()) as CreativeAsset
      }

      return row
    },
    [lineItemLink, mbaNumber, mediaPlanMasterId],
  )

  const processFile = useCallback(
    async (file: File, queueId: string) => {
      if (!isAcceptedCreativeFile(file)) {
        updateQueueItem(queueId, {
          status: "error",
          error: "File type not supported. Use images, video, audio, PDF, or ZIP.",
        })
        return
      }

      updateQueueItem(queueId, { status: "uploading", progress: 0 })

      try {
        const pathname = `creative/${mbaNumber}/${file.name}`
        const clientPayload = JSON.stringify({
          mba_number: mbaNumber,
          media_plan_master_id: mediaPlanMasterId,
          file_size_bytes: file.size,
          line_item_id: lineItemLink?.line_item_id ?? "",
          source_table: lineItemLink?.source_table ?? "",
        })

        const blob = await upload(pathname, file, {
          access: "private",
          handleUploadUrl: "/api/creative-assets/upload",
          clientPayload,
          onUploadProgress: ({ loaded, total, percentage }) => {
            updateQueueItem(queueId, {
              progress: percentage,
              loaded,
              total: total || file.size,
            })
          },
        })

        updateQueueItem(queueId, { status: "registering", progress: 100 })
        const dimensions = await extractAssetDimensions(file)
        const asset = await registerAsset(file, blob, dimensions)
        updateQueueItem(queueId, { status: "done", progress: 100 })
        onAssetRegistered(asset)
        window.setTimeout(() => {
          setQueue((prev) => prev.filter((item) => item.id !== queueId))
        }, CLEAR_DONE_DELAY_MS)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed"
        updateQueueItem(queueId, { status: "error", error: message })
        onError(message)
      }
    },
    [lineItemLink, mbaNumber, mediaPlanMasterId, onAssetRegistered, onError, registerAsset, updateQueueItem],
  )

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return

      const newItems: UploadQueueItem[] = list.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "pending",
        progress: 0,
        loaded: 0,
        total: file.size,
      }))

      setQueue((prev) => [...prev, ...newItems])
      newItems.forEach((item) => {
        void processFile(item.file, item.id)
      })
    },
    [processFile],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragOver(false)
      if (disabled) return
      enqueueFiles(event.dataTransfer.files)
    },
    [disabled, enqueueFiles],
  )

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "interactive flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-panel px-6 py-10 text-center transition-colors",
          dragOver && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <Upload className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Images, video, audio, PDF, or ZIP — up to 500 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptAttribute()}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files) enqueueFiles(event.target.files)
            event.target.value = ""
          }}
        />
      </div>

      {queue.length > 0 ? (
        <ul className="space-y-2">
          {queue.map((item) => {
            const loadedBytes = item.loaded || 0
            const totalBytes = item.total || item.file.size
            const showProgress =
              item.status === "pending" ||
              item.status === "uploading" ||
              item.status === "registering"

            return (
              <li
                key={item.id}
                className="space-y-1.5 rounded-input border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {item.file.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.status === "uploading" || item.status === "registering" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        {item.status === "registering"
                          ? "Saving…"
                          : `${Math.round(item.progress)}%`}
                      </span>
                    ) : null}
                    {item.status === "done" ? (
                      <span className="text-status-ahead-fg">Uploaded</span>
                    ) : null}
                    {item.status === "error" ? (
                      <span className="text-status-critical-fg">{item.error || "Failed"}</span>
                    ) : null}
                    {item.status === "pending" ? (
                      <span>Waiting…</span>
                    ) : null}
                  </span>
                </div>
                {showProgress ? (
                  <>
                    <ProgressBar value={item.progress} max={100} size="sm" />
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="num">
                        {formatFileSize(loadedBytes)} / {formatFileSize(totalBytes)}
                      </span>
                      <span className="num">{Math.round(item.progress)}%</span>
                    </div>
                  </>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {queue.some((item) => item.status === "done") ? (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setQueue([])}>
            Clear upload list
          </Button>
        </div>
      ) : null}
    </div>
  )
}
