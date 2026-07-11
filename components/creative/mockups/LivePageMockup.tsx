"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CreativeAsset } from "@/lib/creative/types"

type SlotSummary = {
  matchedCounts: Record<string, number>
  emptyCounts: Record<string, number>
  total: number
  matchedTotal: number
  emptyTotal: number
  creativeSize: string | null
}

type MockPageSuccess = {
  html: string
  finalUrl: string
  summary: SlotSummary
}

type LivePageMockupProps = {
  asset: CreativeAsset
  onUseBuiltInTemplates: () => void
}

function formatCountMap(counts: Record<string, number>, suffix: string): string[] {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([size, n]) => `${n} × ${size} slot${n === 1 ? "" : "s"} ${suffix}`)
}

export function LivePageMockup({ asset, onUseBuiltInTemplates }: LivePageMockupProps) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MockPageSuccess | null>(null)

  // Reset when asset changes
  useEffect(() => {
    setResult(null)
    setError(null)
  }, [asset.id])

  async function loadPage() {
    const trimmed = url.trim()
    if (!trimmed) {
      setError("Paste an https URL to preview.")
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch("/api/creative-assets/mock-page", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          creative: {
            id: asset.id,
            mime_type: asset.mime_type,
            width_px: asset.width_px,
            height_px: asset.height_px,
            asset_name: asset.asset_name,
          },
        }),
      })
      const data = (await response.json()) as MockPageSuccess & {
        error?: string
        message?: string
      }
      if (!response.ok) {
        setError(
          data.message ||
            "This page couldn’t be loaded for mockup. Try a built-in template instead.",
        )
        return
      }
      if (!data.html) {
        setError("This page couldn’t be loaded for mockup. Try a built-in template instead.")
        return
      }
      setResult({
        html: data.html,
        finalUrl: data.finalUrl,
        summary: data.summary,
      })
    } catch {
      setError("This page couldn’t be loaded for mockup. Try a built-in template instead.")
    } finally {
      setLoading(false)
    }
  }

  const summaryParts: string[] = []
  if (result) {
    summaryParts.push(...formatCountMap(result.summary.matchedCounts, "matched"))
    summaryParts.push(...formatCountMap(result.summary.emptyCounts, "empty (no matching creative size)"))
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4">
      <div className="rounded-card border border-border bg-card p-4 shadow-e1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="live-page-url">Live page URL</Label>
            <Input
              id="live-page-url"
              type="url"
              inputMode="url"
              placeholder="https://www.example.com/article…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void loadPage()
                }
              }}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Fetches a public https page as a static shell and places your{" "}
              <span className="num">
                {asset.width_px}×{asset.height_px}
              </span>{" "}
              creative into matching ad slots. Page scripts never run.
            </p>
          </div>
          <Button type="button" onClick={() => void loadPage()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Loading…
              </>
            ) : (
              "Load page"
            )}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-card border border-border bg-card p-4 text-sm text-foreground shadow-e0">
          <p className="font-medium text-status-critical-fg">Couldn’t load live page</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={onUseBuiltInTemplates}
          >
            Use built-in templates
          </Button>
        </div>
      ) : null}

      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-input border border-border bg-surface-panel px-3 py-2 text-sm text-muted-foreground">
            {result.summary.total === 0 ? (
              <p>
                No ad slots detected on this page. Your creative won’t appear — try another URL or a
                built-in template.
              </p>
            ) : summaryParts.length > 0 ? (
              <p>{summaryParts.join(" · ")}</p>
            ) : (
              <p>
                {result.summary.total} slot{result.summary.total === 1 ? "" : "s"} detected
              </p>
            )}
            {result.finalUrl ? (
              <a
                href={result.finalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-foreground underline-offset-2 hover:underline"
              >
                Source
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>

          {/*
            allow-same-origin: load authenticated creative assets (img/video/preview).
            NO allow-scripts: shell JS cannot run (scripts also stripped server-side).
          */}
          <iframe
            title="Live page mockup shell"
            sandbox="allow-same-origin"
            srcDoc={result.html}
            className="h-[min(70vh,900px)] w-full rounded-card border border-border bg-card shadow-e1"
          />
        </>
      ) : null}
    </div>
  )
}
