"use client"

import { useEffect, useMemo, useState } from "react"
import { AdminGuard } from "@/components/guards/AdminGuard"
import { BestPracticeEditor } from "@/components/best-practice/BestPracticeEditor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  EMPTY_BEST_PRACTICE,
  normalizeBestPractice,
  type BestPractice,
} from "@/lib/types/bestPractice"
import type { MediaContainerBestPractice } from "@/lib/types/publisher"

const CONTAINERS = [
  { key: "search", label: "Search" },
  { key: "socialmedia", label: "Social Media" },
  { key: "digiaudio", label: "Digital Audio" },
  { key: "digidisplay", label: "Digital Display" },
  { key: "digivideo", label: "Digital Video" },
  { key: "bvod", label: "BVOD" },
  { key: "integration", label: "Integration" },
  { key: "progdisplay", label: "Programmatic Display" },
  { key: "progvideo", label: "Programmatic Video" },
  { key: "progbvod", label: "Programmatic BVOD" },
  { key: "progaudio", label: "Programmatic Audio" },
  { key: "progooh", label: "Programmatic OOH" },
] as const

type ContainerKey = (typeof CONTAINERS)[number]["key"]

type Draft = {
  best_practice: BestPractice
  is_active: boolean
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

function emptyDraft(): Draft {
  return { best_practice: null, is_active: true }
}

function rowToDraft(row: MediaContainerBestPractice | undefined): Draft {
  if (!row) return emptyDraft()
  return {
    best_practice: normalizeBestPractice(row.best_practice),
    is_active: row.is_active !== false,
  }
}

export default function MediaContainerBestPracticePage() {
  const [rows, setRows] = useState<MediaContainerBestPractice[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [statusByKey, setStatusByKey] = useState<Record<string, SaveStatus>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadRows() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const response = await fetch("/api/media-container-best-practice")
        if (!response.ok) throw new Error("Failed to load media-container best practices")
        const data = await response.json()
        const nextRows = Array.isArray(data) ? (data as MediaContainerBestPractice[]) : []
        if (cancelled) return
        setRows(nextRows)
        setDrafts(
          Object.fromEntries(
            CONTAINERS.map((container) => [
              container.key,
              rowToDraft(nextRows.find((row) => row.media_container === container.key)),
            ]),
          ),
        )
      } catch (error) {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : "Failed to load media-container best practices")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadRows()
    return () => {
      cancelled = true
    }
  }, [])

  const rowsByContainer = useMemo(
    () => new Map(rows.map((row) => [row.media_container, row])),
    [rows],
  )

  const updateDraft = (key: ContainerKey, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? emptyDraft()),
        ...patch,
      },
    }))
    setStatusByKey((prev) => ({ ...prev, [key]: "idle" }))
  }

  const saveContainer = async (key: ContainerKey) => {
    const draft = drafts[key] ?? emptyDraft()
    const existing = rowsByContainer.get(key)
    setStatusByKey((prev) => ({ ...prev, [key]: "saving" }))

    try {
      const response = await fetch(
        existing
          ? `/api/media-container-best-practice/${encodeURIComponent(String(existing.id))}`
          : "/api/media-container-best-practice",
        {
          method: existing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_container: key,
            best_practice: draft.best_practice,
            is_active: draft.is_active,
          }),
        },
      )
      if (!response.ok) throw new Error("Save failed")
      const saved = (await response.json()) as MediaContainerBestPractice
      setRows((prev) => {
        const withoutCurrent = prev.filter((row) => row.media_container !== key)
        return [...withoutCurrent, saved]
      })
      setDrafts((prev) => ({ ...prev, [key]: rowToDraft(saved) }))
      setStatusByKey((prev) => ({ ...prev, [key]: "saved" }))
    } catch (error) {
      console.error("Failed to save media-container best practice:", error)
      setStatusByKey((prev) => ({ ...prev, [key]: "error" }))
    }
  }

  return (
    <AdminGuard>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold">Media-Container Best Practice Notes</h1>
          <p className="text-sm text-muted-foreground">
            Manage the notes that appear above naming-convention workbook tabs for each media container.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading media-container notes...</p>
        ) : null}
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

        <div className="grid gap-6">
          {CONTAINERS.map((container) => {
            const draft = drafts[container.key] ?? emptyDraft()
            const status = statusByKey[container.key] ?? "idle"

            return (
              <Card key={container.key}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{container.label}</CardTitle>
                      <CardDescription>{container.key}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`active-${container.key}`}
                        checked={draft.is_active}
                        onCheckedChange={(checked) => updateDraft(container.key, { is_active: checked })}
                      />
                      <Label htmlFor={`active-${container.key}`}>Active</Label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <BestPracticeEditor
                    value={draft.best_practice ?? EMPTY_BEST_PRACTICE}
                    onChange={(best_practice) => updateDraft(container.key, { best_practice })}
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      onClick={() => saveContainer(container.key)}
                      disabled={status === "saving"}
                    >
                      {status === "saving" ? "Saving..." : "Save"}
                    </Button>
                    {status === "saved" ? (
                      <span className="text-sm text-green-600">Saved</span>
                    ) : null}
                    {status === "error" ? (
                      <span className="text-sm text-destructive">Save failed</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </main>
    </AdminGuard>
  )
}
