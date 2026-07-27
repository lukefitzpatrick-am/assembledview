"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import type { TokenOverrides } from "@/lib/naming/channelTabs"
import type { TokenSourceItem } from "@/lib/naming/summariseTargetingTokens"
import { cn } from "@/lib/utils"

type NamingAiTokenPrefillProps = {
  /** Collect current plan token sources (called on click). */
  getSources: () => TokenSourceItem[]
  overrides: TokenOverrides
  onOverridesChange: (next: TokenOverrides, appliedCount: number) => void
  disabled?: boolean
  className?: string
}

/**
 * Optional AVA pre-fill for naming targeting/geo tokens.
 * Download never waits on this — overrides are applied only after a successful run.
 */
export function NamingAiTokenPrefill({
  getSources,
  overrides,
  onOverridesChange,
  disabled,
  className,
}: NamingAiTokenPrefillProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const appliedCount = Object.values(overrides).reduce((n, entry) => {
    if (entry.targeting) n += 1
    if (entry.geo) n += 1
    return n
  }, 0)
  const hasOverrides = appliedCount > 0

  const run = async () => {
    const sources = getSources()
    if (sources.length === 0) {
      toast({
        title: "No line items",
        description: "Add naming-relevant line items before cleaning tokens.",
      })
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/naming/summarise-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: sources }),
      })
      const data = (await res.json().catch(() => null)) as {
        overrides?: TokenOverrides
        appliedCount?: number
        usedAva?: boolean
        error?: string
      } | null

      if (!res.ok || !data?.usedAva) {
        onOverridesChange({}, 0)
        toast({
          title: "AI tokens unavailable",
          description:
            data?.error ||
            "Using auto slugs for download. You can still export Naming Conventions.",
          variant: "destructive",
        })
        return
      }

      const next = data.overrides ?? {}
      const count = data.appliedCount ?? 0
      onOverridesChange(next, count)
      toast({
        title: "AI tokens applied",
        description: `${count} targeting/geo token${count === 1 ? "" : "s"} cleaned.`,
      })
    } catch (err) {
      onOverridesChange({}, 0)
      toast({
        title: "AI tokens unavailable",
        description:
          err instanceof Error
            ? err.message
            : "Using auto slugs for download.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void run()}
        disabled={disabled || loading}
        className="h-9 shrink-0 rounded-pill border-border px-3 focus-visible:ring-2 focus-visible:ring-ring"
        title="Optionally clean targeting/geo tokens via AVA before download"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        <span className="ml-2 hidden sm:inline">
          {loading ? "Cleaning…" : "AI-clean tokens"}
        </span>
      </Button>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {hasOverrides
          ? `AI tokens applied (${appliedCount})`
          : "using auto slugs"}
      </span>
    </div>
  )
}
