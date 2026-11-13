"use client"

/**
 * Task followers and attachments in the task detail (B41, codex_projects on;
 * nothing before 0118). Followers: the list, Follow or Unfollow, add a
 * colleague. Attachments: files (private, opened through the gated route)
 * and links (shown with their host), with a count, add and delete (the
 * uploader or an admin). `TaskCollabPanelView` draws; `TaskCollabPanel`
 * loads and saves.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, FileText, Link2, Paperclip, Trash2, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { ATTACHMENT_TYPES, formatAttachmentSize, type TaskAttachment } from "@/lib/codex/attachments"
import { rosterDisplayName } from "@/lib/codex/rosterResolve"
import type { TeamMember } from "@/lib/codex/types"

export type TaskFollowerItem = { email: string; name: string; reason: string }

export type TaskCollabData = {
  followers: TaskFollowerItem[]
  following: boolean
  attachments: TaskAttachment[]
}

export type TaskCollabPanelViewProps = {
  taskId: number
  data: TaskCollabData
  members: readonly TeamMember[]
  busy?: boolean
  onFollow: () => void
  onUnfollow: () => void
  onAddFollower: (email: string) => void
  onUploadFile: (file: File) => void
  onAddLink: (url: string, name: string) => void
  onDeleteAttachment: (attachment: TaskAttachment) => void
}

const ACCEPT = Object.keys(ATTACHMENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(",")

export function TaskCollabPanelView({
  taskId,
  data,
  members,
  busy,
  onFollow,
  onUnfollow,
  onAddFollower,
  onUploadFile,
  onAddLink,
  onDeleteAttachment,
}: TaskCollabPanelViewProps) {
  const [linkUrl, setLinkUrl] = useState("")
  const [linkName, setLinkName] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const followingEmails = new Set(data.followers.map((f) => f.email))
  const addable = members.filter((m) => m.active !== false && !followingEmails.has(m.email.trim().toLowerCase()))

  return (
    <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-e1" aria-label="Followers and attachments">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" aria-hidden />
            Followers
          </h2>
          {data.following ? (
            <Button type="button" variant="outline" size="sm" onClick={onUnfollow} disabled={busy}>
              Unfollow
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onFollow} disabled={busy}>
              Follow
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.followers.length === 0 ? (
            <span className="text-sm text-muted-foreground">No one follows this task.</span>
          ) : (
            data.followers.map((f) => (
              <Badge key={f.email} variant="neutral" size="sm" title={f.email}>
                {f.name}
              </Badge>
            ))
          )}
        </div>
        {addable.length > 0 ? (
          <Select value="" onValueChange={(email) => email && onAddFollower(email)} disabled={busy}>
            <SelectTrigger className="h-8 w-full max-w-xs text-sm" aria-label="Add a follower">
              <SelectValue placeholder="Add a follower" />
            </SelectTrigger>
            <SelectContent>
              {addable.map((m) => (
                <SelectItem key={m.email} value={m.email.trim().toLowerCase()}>
                  {rosterDisplayName(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4" aria-hidden />
          Attachments
          {data.attachments.length > 0 ? <span className="num text-xs text-muted-foreground">({data.attachments.length})</span> : null}
        </h2>
        {data.attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.attachments.map((a) => (
              <li key={a.id} className="flex min-w-0 items-center gap-2 text-sm">
                {a.kind === "link" ? <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {a.kind === "link" && a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-primary hover:underline">
                    {a.name}
                  </a>
                ) : (
                  <a href={`/api/codex/tasks/${taskId}/attachments/${a.id}`} className="min-w-0 truncate text-primary hover:underline">
                    {a.name}
                  </a>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.kind === "link" ? (
                    <span className="inline-flex items-center gap-1">
                      {a.host}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </span>
                  ) : (
                    formatAttachmentSize(a.size_bytes)
                  )}
                </span>
                {a.can_delete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2"
                    aria-label={`Delete ${a.name}`}
                    onClick={() => onDeleteAttachment(a)}
                    disabled={busy}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            aria-label="Attach a file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onUploadFile(file)
              e.target.value = ""
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            Attach a file
          </Button>
          <span className="text-xs text-muted-foreground">Up to 4 MB. Bigger files: put them in SharePoint and attach the link.</span>
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!linkUrl.trim()) return
            onAddLink(linkUrl.trim(), linkName.trim())
            setLinkUrl("")
            setLinkName("")
          }}
        >
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://… link"
            aria-label="Link to attach"
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <Input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Name (optional)"
            aria-label="Link name"
            className="h-8 w-40 text-sm"
          />
          <Button type="submit" variant="outline" size="sm" disabled={busy || !linkUrl.trim()}>
            Attach link
          </Button>
        </form>
      </div>
    </section>
  )
}

/** Loads followers and attachments; hidden until both load (switch off or before 0118: nothing). */
export function TaskCollabPanel({ taskId, members, reloadKey }: { taskId: number; members: readonly TeamMember[]; reloadKey?: unknown }) {
  const { toast } = useToast()
  const [data, setData] = useState<TaskCollabData | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [f, a] = await Promise.all([
          fetch(`/api/codex/tasks/${taskId}/followers`, { cache: "no-store" }),
          fetch(`/api/codex/tasks/${taskId}/attachments`, { cache: "no-store" }),
        ])
        if (!f.ok || !a.ok) {
          if (!cancelled) setData(null)
          return
        }
        const fb = (await f.json()) as { followers?: TaskFollowerItem[]; following?: boolean }
        const ab = (await a.json()) as { attachments?: TaskAttachment[] }
        if (!cancelled) {
          setData({
            followers: Array.isArray(fb.followers) ? fb.followers : [],
            following: fb.following === true,
            attachments: Array.isArray(ab.attachments) ? ab.attachments : [],
          })
        }
      } catch {
        if (!cancelled) setData(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [taskId, tick, reloadKey])

  const run = useCallback(
    async (url: string, init: RequestInit, failTitle: string) => {
      setBusy(true)
      try {
        const res = await fetch(url, init)
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null
          toast({ title: failTitle, description: body?.message || "Try again.", variant: "destructive" })
          return
        }
        setTick((n) => n + 1)
      } catch {
        toast({ title: failTitle, description: "Could not reach the server.", variant: "destructive" })
      } finally {
        setBusy(false)
      }
    },
    [toast]
  )

  if (!data) return null
  const json = (method: string, body?: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return (
    <TaskCollabPanelView
      taskId={taskId}
      data={data}
      members={members}
      busy={busy}
      onFollow={() => void run(`/api/codex/tasks/${taskId}/followers`, json("POST", {}), "Not followed")}
      onUnfollow={() => void run(`/api/codex/tasks/${taskId}/followers`, json("DELETE"), "Not unfollowed")}
      onAddFollower={(email) => void run(`/api/codex/tasks/${taskId}/followers`, json("POST", { email }), "Follower not added")}
      onUploadFile={(file) => {
        const form = new FormData()
        form.append("file", file)
        void run(`/api/codex/tasks/${taskId}/attachments`, { method: "POST", body: form }, "File not attached")
      }}
      onAddLink={(url, name) => void run(`/api/codex/tasks/${taskId}/attachments`, json("POST", { url, name }), "Link not attached")}
      onDeleteAttachment={(a) => void run(`/api/codex/tasks/${taskId}/attachments/${a.id}`, json("DELETE"), "Attachment not deleted")}
    />
  )
}
