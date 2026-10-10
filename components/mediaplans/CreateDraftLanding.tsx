"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { shouldOfferCreateLocalDraft } from "@/lib/mediaplan/drafts/createLocalDraft"
import {
  CREATE_DRAFT_SESSION_KEY,
  createDraftListFields,
  importCreateDraftFile,
  isCreateDraftId,
} from "@/lib/mediaplan/drafts/createBrowserDraft"
import { formatDraftRelativeTime } from "@/lib/mediaplan/drafts/fieldDiff"
import {
  clearLocalDraft,
  listCreateBrowserDrafts,
  migrateLegacyCreateDrafts,
  writeLocalDraft,
  type LocalDraftRecord,
} from "@/lib/mediaplan/drafts/localStore"

function lineLabel(count: number): string {
  return count === 1 ? "1 line" : `${count} lines`
}

function rememberDraftId(draftId: string): void {
  try {
    sessionStorage.setItem(CREATE_DRAFT_SESSION_KEY, draftId)
  } catch {
    /* private mode */
  }
}

export function CreateDraftLanding() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const [userId, setUserId] = useState("")
  const [drafts, setDrafts] = useState<LocalDraftRecord[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LocalDraftRecord | null>(null)

  const openDraft = useCallback(
    (draftId: string) => {
      rememberDraftId(draftId)
      const params = new URLSearchParams(searchParams.toString())
      params.set("draft", draftId)
      router.push(`/mediaplans/create?${params.toString()}`)
    },
    [router, searchParams],
  )

  const reload = useCallback(async (email: string) => {
    await migrateLegacyCreateDrafts(email)
    const rows = await listCreateBrowserDrafts(email)
    const visible: LocalDraftRecord[] = []
    for (const row of rows) {
      if (
        !row.draftId ||
        !shouldOfferCreateLocalDraft({ state: row.state, updatedAt: row.updatedAt })
      ) {
        if (row.draftId) {
          await clearLocalDraft({
            masterId: null,
            mbaNumber: row.previewMba ?? row.state.mbaNumber ?? "",
            userId: email,
            createDraftId: row.draftId,
          })
        }
        continue
      }
      visible.push(row)
    }
    visible.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    setDrafts(visible)
    setReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" })
        if (!res.ok) return
        const json = (await res.json()) as { user?: { email?: string } }
        const email = String(json.user?.email ?? "").trim()
        if (!email || cancelled) return
        setUserId(email)
        await reload(email)
      } catch {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  async function onImport(file: File) {
    setError(null)
    if (!userId) {
      setError("Sign in to import a draft.")
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      setError("This file isn't a draft.")
      return
    }
    const parsed = importCreateDraftFile(raw)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const draftId = crypto.randomUUID()
    await writeLocalDraft({
      masterId: null,
      mbaNumber: parsed.payload.mbaNumber,
      userId,
      createDraftId: draftId,
      state: parsed.payload,
    })
    openDraft(draftId)
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Unsaved campaigns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each tab keeps its own draft on this browser.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            const id = crypto.randomUUID()
            if (!isCreateDraftId(id)) return
            openDraft(id)
          }}
        >
          Start new
        </Button>
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          Import draft
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void onImport(file)
          }}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!ready ? (
        <p className="text-sm text-muted-foreground">Loading drafts…</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved drafts on this browser.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drafts.map((row) => {
            const fields = createDraftListFields(
              row.state,
              row.previewMba || row.state.mbaNumber || "",
            )
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card px-3 py-3 shadow-e0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {fields.clientName}
                    <span className="text-muted-foreground"> · {fields.campaignName}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {lineLabel(fields.lineCount)}
                    {fields.previewMba ? ` · ${fields.previewMba}` : ""}
                    {" · "}
                    saved {formatDraftRelativeTime(row.updatedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => row.draftId && openDraft(row.draftId)}
                  >
                    Resume
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingDelete(row)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from this browser. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={() => {
                const row = pendingDelete
                setPendingDelete(null)
                if (!row?.draftId || !userId) return
                void clearLocalDraft({
                  masterId: null,
                  mbaNumber: row.previewMba ?? row.state.mbaNumber ?? "",
                  userId,
                  createDraftId: row.draftId,
                }).then(() => reload(userId))
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
