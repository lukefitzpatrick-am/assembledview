"use client"

/**
 * "Why isn't this on the AA plan?" (FB-10). Small read-only info control on
 * each media and production line card. Shows the publisher as resolved, its
 * billing agency and whether the line goes on the Advertising Associates
 * plan, with the reason when it does not (`explainAaRouting`).
 *
 * Publishers load on first open only (shared cached fetch), so cards that
 * are never opened cost nothing.
 */

import * as React from "react"
import { Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { explainAaRouting, type AaRoutingExplanation } from "@/lib/mediaplan/explainAaRouting"
import {
  buildPublisherNameIndex,
  type PublisherNameIndex,
} from "@/lib/publisher/resolvePublisherName"
import type { PublisherIdentityRow } from "@/lib/publisher/publisherUniqueness"
import { cn } from "@/lib/utils"

let indexPromise: Promise<PublisherNameIndex<PublisherIdentityRow>> | null = null

function loadPublisherIndex(): Promise<PublisherNameIndex<PublisherIdentityRow>> {
  if (!indexPromise) {
    indexPromise = import("@/lib/api")
      .then(({ getPublishersForAaRouting }) => getPublishersForAaRouting())
      .then((rows) => {
        // Keep a failed or empty load retryable on the next open.
        if (rows.length === 0) indexPromise = null
        return buildPublisherNameIndex(rows as PublisherIdentityRow[])
      })
      .catch((err: unknown) => {
        indexPromise = null
        throw err
      })
  }
  return indexPromise
}

export type AaRoutingInfoProps = {
  /** The line's publisher fields (publisher, network, platform, site). */
  names: readonly (string | null | undefined)[]
  clientPaysForMedia?: boolean
  lineLabel: string
  className?: string
}

export function AaRoutingInfo({ names, clientPaysForMedia, lineLabel, className }: AaRoutingInfoProps) {
  const [open, setOpen] = React.useState(false)
  const [index, setIndex] = React.useState<PublisherNameIndex<PublisherIdentityRow> | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (!open || index) return
    let cancelled = false
    setFailed(false)
    loadPublisherIndex()
      .then((idx) => {
        if (!cancelled) setIndex(idx)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, index])

  const namesKey = names.map((n) => String(n ?? "")).join("\u001f")
  const explanation: AaRoutingExplanation | null = React.useMemo(
    () => (index ? explainAaRouting({ names, clientPaysForMedia }, index) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namesKey is the stable form of names
    [index, namesKey, clientPaysForMedia],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 w-7 shrink-0 rounded-full p-0 text-muted-foreground", className)}
          aria-label={`Is ${lineLabel} on the AA plan?`}
          title="Is this line on the AA plan?"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-xs">
        <p className="text-sm font-semibold">Advertising Associates plan</p>
        {failed ? (
          <p className="text-muted-foreground">Could not load publishers. Close and try again.</p>
        ) : !explanation ? (
          <p className="text-muted-foreground">Checking publishers…</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Publisher</dt>
              <dd>
                {explanation.publisher
                  ? explanation.publisher.name
                  : explanation.enteredName
                    ? `"${explanation.enteredName}" (not found)`
                    : "None"}
              </dd>
              <dt className="text-muted-foreground">Billing agency</dt>
              <dd>{explanation.billingAgency ?? "Unknown"}</dd>
              <dt className="text-muted-foreground">On AA plan</dt>
              <dd className={cn("font-medium", explanation.onAaPlan ? "text-foreground" : "text-status-warning")}>
                {explanation.onAaPlan ? "Yes" : "No"}
              </dd>
            </dl>
            <p>{explanation.message}</p>
            {explanation.notes.map((note) => (
              <p key={note} className="text-muted-foreground">
                {note}
              </p>
            ))}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
