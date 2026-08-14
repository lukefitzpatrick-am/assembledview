"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

export type Auth0RosterSyncResult = {
  status: "ok" | "not_configured" | "error"
  seen: number
  created: number
  updated: number
  skipped: number
  missingInAuth0: number
  noResolvableRole: number
  treatedAsAdminByDomainRule?: number
  message?: string
}

export function Auth0RosterSyncButton({
  onComplete,
}: {
  onComplete?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Auth0RosterSyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/auth0-roster-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const body = (await res.json().catch(() => null)) as
        | Auth0RosterSyncResult
        | { message?: string }
        | null
      if (!res.ok || !body || !("status" in body)) {
        throw new Error(
          (body as { message?: string } | null)?.message || `HTTP ${res.status}`,
        )
      }
      setResult(body)
      onComplete?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() => void run()}
      >
        <RefreshCw
          className={
            busy ? "mr-1.5 h-3.5 w-3.5 animate-spin" : "mr-1.5 h-3.5 w-3.5"
          }
        />
        {busy ? "Syncing…" : "Sync roster"}
      </Button>
      {result ? (
        <p className="text-sm text-muted-foreground">
          {result.status === "not_configured" ? (
            result.message ?? "Auth0 Management API is not configured."
          ) : result.status === "ok" ? (
            <>
              Last run: <span className="num">{result.seen}</span> seen
              {" · "}
              <span className="num">{result.created}</span> created
              {" · "}
              <span className="num">{result.updated}</span> updated
              {" · "}
              <span className="num">{result.skipped}</span> skipped
              {" · "}
              in roster, not in Auth0:{" "}
              <span className="num">{result.missingInAuth0}</span>
              {" · "}
              users with no resolvable role:{" "}
              <span className="num">{result.noResolvableRole}</span>
              {" · "}
              treated as admin by domain rule:{" "}
              <span className="num">
                {result.treatedAsAdminByDomainRule ?? 0}
              </span>
            </>
          ) : (
            <>Last run failed: {result.message ?? "error"}</>
          )}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-status-critical-fg">{error}</p>
      ) : null}
    </div>
  )
}
