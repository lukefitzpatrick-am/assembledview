"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { coalescedGetJson } from "@/lib/api/coalescedGetJson"
import { getClientDisplayName } from "@/lib/clients/slug"
import { matchTextAny } from "@/lib/search/matchText"
import { startViewAs } from "@/components/view-as/viewAsClient"

export const VIEW_AS_DURATION_OPTIONS = [30, 60, 120] as const

export type ViewAsClientOption = { slug: string; name: string }

const FIELD_CLASS = "h-9 rounded-input border border-border bg-card px-2 text-sm text-foreground"

/**
 * Start a client view: client (fixed, or picked with a search), duration
 * (30, 60 or 120 minutes, default 60). Client level only: all of that
 * client's campaigns, exactly as a client user with no campaign restriction.
 */
export function ViewAsStartForm({
  fixedClient = null,
  onCancel,
}: {
  fixedClient?: ViewAsClientOption | null
  onCancel?: () => void
}) {
  const [minutes, setMinutes] = useState<number>(60)
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<ViewAsClientOption | null>(fixedClient)
  const [clients, setClients] = useState<ViewAsClientOption[] | null>(fixedClient ? [] : null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (fixedClient) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await coalescedGetJson<Array<Record<string, unknown>>>("/api/clients")
        const options = (Array.isArray(rows) ? rows : [])
          .map((row) => ({ slug: String(row.slug ?? "").trim(), name: getClientDisplayName(row) }))
          .filter((row) => row.slug && row.name)
          .sort((a, b) => a.name.localeCompare(b.name, "en-AU", { sensitivity: "base" }))
        if (cancelled) return
        if (options.length === 0) setLoadError("No clients with a dashboard slug could be loaded.")
        setClients(options)
      } catch {
        if (!cancelled) setLoadError("Could not load clients.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fixedClient])

  const matches = useMemo(
    () => (clients ?? []).filter((c) => matchTextAny([c.name, c.slug], query)).slice(0, 8),
    [clients, query],
  )

  async function onStart() {
    if (!picked) return
    setBusy(true)
    setError(null)
    const result = await startViewAs(picked.slug, minutes)
    if (!result.ok) {
      setError(result.message)
      setBusy(false)
      return
    }
    window.location.assign(result.redirect)
  }

  return (
    <div className="flex flex-col gap-4" data-testid="view-as-start-form">
      {fixedClient ? (
        <p className="text-sm text-foreground">
          Client: <span className="font-semibold">{fixedClient.name}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="view-as-client-search">
            Client
          </label>
          <Input
            id="view-as-client-search"
            className="h-9"
            placeholder="Search clients…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPicked(null)
            }}
          />
          {loadError ? <p className="text-sm text-muted-foreground">{loadError}</p> : null}
          {clients === null && !loadError ? <p className="text-sm text-muted-foreground">Loading clients…</p> : null}
          {picked ? (
            <p className="text-sm text-foreground">
              Selected: <span className="font-semibold">{picked.name}</span>
            </p>
          ) : (
            <ul className="flex max-h-56 flex-col overflow-y-auto" aria-label="Matching clients">
              {matches.map((client) => (
                <li key={client.slug}>
                  <button
                    type="button"
                    className="w-full rounded-input px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setPicked(client)}
                  >
                    {client.name}
                    <span className="ml-2 text-xs text-muted-foreground">{client.slug}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Ends after
        <select className={FIELD_CLASS} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          {VIEW_AS_DURATION_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value} minutes
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        You see exactly what this client sees: their sidebar, pages and data, read-only. No Ava, no admin
        menus. Every start and exit is logged.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" size="sm" onClick={() => void onStart()} disabled={!picked || busy}>
          {busy ? "Starting…" : "View as client"}
        </Button>
      </div>
    </div>
  )
}
