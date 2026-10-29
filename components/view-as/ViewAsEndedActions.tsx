"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { exitViewAs } from "@/components/view-as/viewAsClient"

/**
 * Ends the lapsed client view on load (clears both cookies; the exit route
 * writes the `expire` audit row), then offers the two ways on.
 */
export function ViewAsEndedActions({ slug }: { slug: string | null }) {
  const [cleared, setCleared] = useState(false)
  const [hubHref, setHubHref] = useState(slug ? `/client/${encodeURIComponent(slug)}` : "/client")

  useEffect(() => {
    let cancelled = false
    void exitViewAs("expired").then((redirect) => {
      if (cancelled) return
      setHubHref(redirect)
      setCleared(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const startHref = slug ? `/view-as/start?slug=${encodeURIComponent(slug)}` : "/view-as/start"
  return (
    <div className="flex flex-col gap-3" data-testid="view-as-ended">
      <p className="text-sm text-muted-foreground">
        {cleared ? "The client view is closed." : "Closing the client view…"}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" disabled={!cleared}>
          <a href={startHref}>Start again</a>
        </Button>
        <Button asChild size="sm" variant="outline" disabled={!cleared}>
          <a href={hubHref}>Return to the client hub</a>
        </Button>
      </div>
    </div>
  )
}
