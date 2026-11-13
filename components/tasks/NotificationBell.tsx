"use client"

/**
 * The Codex bell (B41, plan 5.3): unread count in the header of every Tasks
 * page, a panel of recent notifications, mark one or all read, open the task,
 * and your daily email digest switch. Shown only with codex_notifications
 * (and codex_projects) on. `NotificationBellPanel` draws; `NotificationBell`
 * loads and saves.
 */
import { formatDistanceToNow, isValid, parseISO } from "date-fns"
import { Bell } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { clientFeatureOn } from "@/lib/features/client"
import { cn } from "@/lib/utils"

export type BellItem = {
  id: number
  kind: string
  task_id: number
  task_title: string
  actor_name: string | null
  text: string
  created_at: string
  read_at: string | null
}

export type BellState = "loading" | "ready" | "unavailable" | "error"

export type NotificationBellPanelProps = {
  state: BellState
  items: BellItem[]
  unread: number
  emailDigest: boolean
  busy?: boolean
  onOpenItem: (item: BellItem) => void
  onMarkAll: () => void
  onEmailDigestChange: (on: boolean) => void
}

function when(value: string): string {
  const d = parseISO(value.includes("T") ? value : value.replace(" ", "T"))
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : ""
}

export function bellLabel(unread: number): string {
  return unread === 0 ? "Notifications" : `Notifications, ${unread} unread`
}

export function NotificationBellPanel({
  state,
  items,
  unread,
  emailDigest,
  busy,
  onOpenItem,
  onMarkAll,
  onEmailDigestChange,
}: NotificationBellPanelProps) {
  return (
    <div className="flex max-h-[70vh] w-[min(92vw,380px)] flex-col" aria-label="Notifications panel">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Notifications</span>
        <Button type="button" variant="ghost" size="sm" onClick={onMarkAll} disabled={busy || unread === 0}>
          Mark all read
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state === "loading" ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : state === "unavailable" ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Notifications need a database update (migration 0118).</p>
        ) : state === "error" ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Notifications could not load. Try again.</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/tasks/${item.task_id}`}
                  onClick={() => onOpenItem(item)}
                  className={cn(
                    "flex gap-2 px-3 py-2 text-sm hover:bg-[var(--row-hover)]",
                    item.read_at ? "text-muted-foreground" : "text-foreground"
                  )}
                  data-unread={item.read_at ? undefined : "true"}
                >
                  <span
                    aria-hidden
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.read_at ? "bg-transparent" : "bg-primary")}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{item.text}</span>
                    <span className="block text-xs text-muted-foreground">{when(item.created_at)}</span>
                  </span>
                  {item.read_at ? null : <span className="sr-only">Unread.</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border px-3 py-2">
        <label className="flex items-center justify-between gap-2 text-sm">
          <span>
            Daily email digest
            <span className="block text-xs text-muted-foreground">08:30 Melbourne, unread only. Never 6 pm to 8 am.</span>
          </span>
          <Switch
            checked={emailDigest}
            onCheckedChange={onEmailDigestChange}
            disabled={busy || state !== "ready"}
            aria-label="Daily email digest"
          />
        </label>
      </div>
    </div>
  )
}

/** The bell button and its panel. Renders nothing with the switches off. */
export function NotificationBell() {
  const on = clientFeatureOn("codex_notifications") && clientFeatureOn("codex_projects")
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<BellState>("loading")
  const [items, setItems] = useState<BellItem[]>([])
  const [unread, setUnread] = useState(0)
  const [emailDigest, setEmailDigest] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/codex/notifications", { cache: "no-store" })
      if (res.status === 503) {
        setState("unavailable")
        return
      }
      if (!res.ok) {
        setState("error")
        return
      }
      const body = (await res.json()) as { items?: BellItem[]; unread?: number; email_digest?: boolean }
      setItems(Array.isArray(body.items) ? body.items : [])
      setUnread(Number(body.unread ?? 0) || 0)
      setEmailDigest(body.email_digest !== false)
      setState("ready")
    } catch {
      setState("error")
    }
  }, [])

  useEffect(() => {
    if (!on) return
    void load()
    const timer = window.setInterval(() => void load(), 120_000)
    return () => window.clearInterval(timer)
  }, [on, load])

  useEffect(() => {
    if (on && open) void load()
  }, [on, open, load])

  if (!on) return null

  const markRead = async (body: unknown) => {
    const res = await fetch("/api/codex/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error("not saved")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="relative" aria-label={bellLabel(unread)}>
          <Bell className="h-4 w-4" aria-hidden />
          {unread > 0 ? (
            <span className="num absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-destructive px-1 text-[10px] font-extrabold leading-[18px] text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <NotificationBellPanel
          state={state}
          items={items}
          unread={unread}
          emailDigest={emailDigest}
          busy={busy}
          onOpenItem={(item) => {
            setOpen(false)
            if (item.read_at) return
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i)))
            setUnread((n) => Math.max(0, n - 1))
            void markRead({ ids: [item.id] }).catch(() => void load())
          }}
          onMarkAll={async () => {
            setBusy(true)
            try {
              await markRead({ all: true })
              await load()
            } catch {
              toast({ title: "Not marked read", description: "Try again.", variant: "destructive" })
            } finally {
              setBusy(false)
            }
          }}
          onEmailDigestChange={async (next) => {
            setBusy(true)
            setEmailDigest(next)
            try {
              const res = await fetch("/api/codex/notifications/prefs", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email_digest: next }),
              })
              if (!res.ok) throw new Error("not saved")
            } catch {
              setEmailDigest(!next)
              toast({ title: "Digest setting not saved", description: "Try again.", variant: "destructive" })
            } finally {
              setBusy(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
