"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, Inbox, ListTodo, Search, Video } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { rosterDisplayName } from "@/lib/codex/rosterResolve"
import {
  CODEX_SEARCH_MAX_CHARS,
  normaliseCodexSearchQuery,
  type CodexSearchResults,
} from "@/lib/codex/search"
import { statusMeta } from "@/lib/codex/types"
import { BUSINESS_TZ } from "@/lib/dates/melbourne"

const DEBOUNCE_MS = 250

function shortDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: BUSINESS_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d)
}

const MATCHED_IN_LABEL = {
  title: "title",
  mba: "MBA",
  description: "description",
  comment: "comment",
} as const

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; results: CodexSearchResults }

/**
 * Codex search (F8, switch `codex_search`). Tasks, Inbox items and meetings.
 * The parent renders this only when the switch is on.
 */
export function CodexSearchDialog({
  clientName,
  onOpenTask,
  onOpenInbox,
}: {
  clientName: (id: number | null) => string | null
  onOpenTask: (id: number) => void
  onOpenInbox: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [state, setState] = useState<SearchState>({ kind: "idle" })
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    const q = normaliseCodexSearchQuery(text)
    const mine = ++seq.current
    if (!q) {
      setState({ kind: "idle" })
      return
    }
    setState({ kind: "loading" })
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/codex/search?q=${encodeURIComponent(q)}`, {
            signal: controller.signal,
          })
          const body = (await res.json().catch(() => null)) as
            | (CodexSearchResults & { message?: string })
            | null
          if (mine !== seq.current) return
          if (!res.ok || !body || !body.tasks) {
            setState({
              kind: "error",
              message: body?.message || "Search failed. Try again.",
            })
            return
          }
          setState({ kind: "done", results: body })
        } catch (error) {
          if (controller.signal.aborted || mine !== seq.current) return
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "Search failed. Try again.",
          })
        }
      })()
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [text, open])

  const results = state.kind === "done" ? state.results : null
  const empty =
    results != null &&
    results.tasks.items.length === 0 &&
    results.inbox.items.length === 0 &&
    results.meetings.items.length === 0

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Search className="mr-2 h-4 w-4" aria-hidden />
        Search
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Search Codex</DialogTitle>
            <DialogDescription>
              Tasks (title, MBA, description, comments), Inbox items and meetings.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={text}
            maxLength={CODEX_SEARCH_MAX_CHARS}
            placeholder="Search tasks, comments, meetings"
            aria-label="Search Codex"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="max-h-[60vh] space-y-5 overflow-y-auto" aria-live="polite">
            {state.kind === "idle" ? (
              <p className="text-sm text-muted-foreground">Type at least 2 characters.</p>
            ) : null}
            {state.kind === "loading" ? (
              <p className="text-sm text-muted-foreground">Searching…</p>
            ) : null}
            {state.kind === "error" ? (
              <p className="text-sm text-destructive" role="alert">
                {state.message}
              </p>
            ) : null}
            {empty ? (
              <p className="text-sm text-muted-foreground">No matches for “{results.q}”.</p>
            ) : null}

            {results && results.tasks.items.length > 0 ? (
              <section aria-label="Tasks" className="space-y-2">
                <h3 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ListTodo className="h-3.5 w-3.5" aria-hidden /> Tasks
                </h3>
                <ul className="space-y-1">
                  {results.tasks.items.map((hit) => {
                    const meta = statusMeta(hit.status)
                    const client = clientName(hit.client_id)
                    return (
                      <li key={`t-${hit.id}`}>
                        <button
                          type="button"
                          className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                          onClick={() => {
                            setOpen(false)
                            onOpenTask(hit.id)
                          }}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{hit.title}</span>
                            <Badge variant={meta.badgeVariant} size="sm">
                              {meta.label}
                            </Badge>
                            {hit.matched_in !== "title" ? (
                              <span className="text-xs text-muted-foreground">
                                in {MATCHED_IN_LABEL[hit.matched_in]}
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {[
                              client,
                              hit.mba_number,
                              hit.assignee_email
                                ? rosterDisplayName({ email: hit.assignee_email, name: hit.assignee_name })
                                : "Unassigned",
                              shortDate(hit.due_date) ? `due ${shortDate(hit.due_date)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {hit.snippet ? (
                            <span className="block truncate text-xs text-muted-foreground">{hit.snippet}</span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {results.tasks.more ? (
                  <p className="text-xs text-muted-foreground">More tasks match. Add a word to narrow it.</p>
                ) : null}
              </section>
            ) : null}

            {results && results.inbox.items.length > 0 ? (
              <section aria-label="Inbox" className="space-y-2">
                <h3 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Inbox className="h-3.5 w-3.5" aria-hidden /> Inbox
                </h3>
                <ul className="space-y-1">
                  {results.inbox.items.map((hit) => (
                    <li key={`p-${hit.id}`}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        onClick={() => {
                          setOpen(false)
                          onOpenInbox()
                        }}
                      >
                        <span className="block font-medium">{hit.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[
                            hit.meeting_title ? `From ${hit.meeting_title}` : "From a meeting",
                            shortDate(hit.meeting_date),
                            clientName(hit.client_id),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {results.inbox.more ? (
                  <p className="text-xs text-muted-foreground">More Inbox items match. Add a word to narrow it.</p>
                ) : null}
              </section>
            ) : null}

            {results && results.meetings.items.length > 0 ? (
              <section aria-label="Meetings" className="space-y-2">
                <h3 className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Video className="h-3.5 w-3.5" aria-hidden /> Meetings
                </h3>
                <ul className="space-y-1">
                  {results.meetings.items.map((hit) => (
                    <li key={`m-${hit.id}`} className="rounded-md px-2 py-1.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{hit.title || "Untitled meeting"}</span>
                        {hit.is_internal ? (
                          <Badge variant="secondary" size="sm">
                            Internal
                          </Badge>
                        ) : null}
                        {hit.transcript_url ? (
                          <a
                            href={hit.transcript_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                          >
                            Fireflies <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[
                          shortDate(hit.meeting_date),
                          clientName(hit.client_id),
                          hit.mba_number,
                          hit.task_count > 0
                            ? `${hit.task_count} task${hit.task_count === 1 ? "" : "s"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {hit.snippet ? (
                        <span className="block text-xs text-muted-foreground">{hit.snippet}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {results.meetings.more ? (
                  <p className="text-xs text-muted-foreground">More meetings match. Add a word to narrow it.</p>
                ) : null}
              </section>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
