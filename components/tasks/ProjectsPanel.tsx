"use client"

/**
 * Projects tab on /tasks (B39, behind codex_projects): the projects you can
 * see (private ones only when you own, created or are a member of them) and
 * New project. A new project starts with To do, In progress and Done (the
 * B38 default). Before migration 0118 it says the database needs an update.
 * New project takes an optional client (B39fix) from the clients list the
 * Tasks page already loads (no FK, plan section 10; the server checks it
 * exists), so pasted and inline-added tasks get the client and MBA.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Lock, PlusCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox, ComboboxModalProvider, type ComboboxOption } from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { rosterDisplayName } from "@/lib/codex/rosterResolve"
import {
  isProjectKind,
  MBA_NUMBER_MAX,
  PROJECT_KINDS,
  PROJECT_NAME_MAX,
  type CodexProject,
  type ProjectKind,
} from "@/lib/codex/projects"
import type { TeamMember } from "@/lib/codex/types"

const KIND_LABEL: Record<ProjectKind, string> = {
  campaign: "Campaign",
  retainer: "Retainer",
  onboarding: "Onboarding",
  pitch: "Pitch",
  internal: "Internal",
  ops: "Ops",
}

const STATUS_LABEL: Record<string, string> = { active: "Active", on_hold: "On hold", closed: "Closed" }

type ListState =
  | { kind: "loading" }
  | { kind: "needs_migration" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: CodexProject[] }

export type NewProjectDraft = {
  name: string
  kind: ProjectKind
  /** Client id as text; "" is no client. */
  client_id: string
  mba_number: string
  is_private: boolean
  owner_email: string
}

/** A client the New project picker offers (from the Tasks page's clients list). */
export type ProjectClientChoice = { id: number; name: string }

/** The picker value for "no client" (a Combobox option needs a non-empty value). */
export const NO_CLIENT = "none"

/** The POST body for a new project. Sections are left to the server default. */
export function newProjectBody(draft: NewProjectDraft): Record<string, unknown> {
  const clientId = Number(draft.client_id)
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    ...(draft.client_id && Number.isSafeInteger(clientId) && clientId > 0 ? { client_id: clientId } : {}),
    ...(draft.mba_number.trim() ? { mba_number: draft.mba_number.trim() } : {}),
    is_private: draft.is_private,
    ...(draft.owner_email ? { owner_email: draft.owner_email } : {}),
  }
}

/** Client picker options: "No client" first, then the clients by name. */
export function projectClientOptions(clients: readonly ProjectClientChoice[]): ComboboxOption[] {
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
  return [
    { value: NO_CLIENT, label: "No client" },
    ...sorted.map((c) => ({ value: String(c.id), label: c.name || `Client ${c.id}`, keywords: String(c.id) })),
  ]
}

/**
 * The owner picker's starting value: you, as the roster item's value
 * (lowercased), when you are an active roster member; otherwise "" so the
 * picker shows its "You" placeholder instead of a blank (the server then
 * makes you the owner).
 */
export function defaultProjectOwner(meEmail: string | null, activeMembers: readonly Pick<TeamMember, "email">[]): string {
  const me = meEmail?.trim().toLowerCase() ?? ""
  if (!me) return ""
  const member = activeMembers.find((m) => m.email.trim().toLowerCase() === me)
  // The same value the picker's items use (m.email.toLowerCase()).
  return member ? member.email.toLowerCase() : ""
}

const NO_CLIENTS: ProjectClientChoice[] = []

function emptyDraft(owner: string): NewProjectDraft {
  return { name: "", kind: "campaign", client_id: "", mba_number: "", is_private: false, owner_email: owner }
}

export function ProjectsTable({ items, nameFor }: { items: CodexProject[]; nameFor: (email: string | null) => string }) {
  if (items.length === 0) {
    return <EmptyState title="No projects yet" message="Create one with New project. Private projects show to their members only." />
  }
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>MBA</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/tasks/projects/${p.id}`} className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline">
                    {p.name}
                    {p.is_private ? <Lock className="h-3 w-3 text-muted-foreground" aria-label="Private" /> : null}
                  </Link>
                </TableCell>
                <TableCell>{KIND_LABEL[p.kind] ?? p.kind}</TableCell>
                <TableCell className="num">{p.mba_number ?? "—"}</TableCell>
                <TableCell>{nameFor(p.owner_email)}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "active" ? "action" : "neutral"} size="sm">
                    {STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function ProjectsPanel({
  active,
  teamMembers,
  meEmail,
  clients = NO_CLIENTS,
}: {
  active: boolean
  teamMembers: TeamMember[]
  meEmail: string | null
  clients?: ProjectClientChoice[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [state, setState] = useState<ListState>({ kind: "loading" })
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<NewProjectDraft>(() => emptyDraft(""))
  const clientOptions = useMemo(() => projectClientOptions(clients), [clients])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/codex/projects", { cache: "no-store" })
        const body = (await res.json().catch(() => null)) as { items?: CodexProject[]; error?: string } | null
        if (cancelled) return
        if (res.status === 503 && body?.error === "migration_not_applied") setState({ kind: "needs_migration" })
        else if (!res.ok) setState({ kind: "error", message: `Projects did not load (${res.status}).` })
        else setState({ kind: "ready", items: body?.items ?? [] })
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Could not reach the server." })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, tick])

  const nameFor = useCallback(
    (email: string | null) => {
      if (!email) return "—"
      const m = teamMembers.find((t) => t.email.toLowerCase() === email.toLowerCase())
      return rosterDisplayName({ name: m?.name ?? null, email })
    },
    [teamMembers]
  )

  const create = async () => {
    if (!draft.name.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/codex/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProjectBody(draft)),
      })
      const body = (await res.json().catch(() => null)) as { project?: CodexProject; message?: string } | null
      if (!res.ok || !body?.project) {
        toast({ title: "Project not created", description: body?.message ?? `(${res.status})`, variant: "destructive" })
        return
      }
      setOpen(false)
      router.push(`/tasks/projects/${body.project.id}`)
    } catch {
      toast({ title: "Project not created", description: "Could not reach the server.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const activeMembers = teamMembers.filter((m) => m.active)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Boards with their own sections. Private projects show to their owner and members only.</p>
        {state.kind === "ready" ? (
          <Button
            type="button"
            onClick={() => {
              setDraft(emptyDraft(defaultProjectOwner(meEmail, activeMembers)))
              setOpen(true)
            }}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New project
          </Button>
        ) : null}
      </div>

      {state.kind === "loading" ? <LoadingState rows={4} /> : null}
      {state.kind === "needs_migration" ? (
        <EmptyState
          title="Projects need a database update"
          message="Migration 0118 (codex_s1_projects) has not run yet. Projects open once it has."
        />
      ) : null}
      {state.kind === "error" ? <ErrorState message={state.message} onRetry={() => setTick((n) => n + 1)} /> : null}
      {state.kind === "ready" ? <ProjectsTable items={state.items} nameFor={nameFor} /> : null}

      <Dialog open={open} onOpenChange={(o) => (!o ? setOpen(false) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              It starts with To do, In progress and Done. Add or rename sections on the board. Tasks added on the board take
              the project&apos;s client and MBA.
            </DialogDescription>
          </DialogHeader>
          <ComboboxModalProvider>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void create()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="codex-project-name">Name</Label>
                <Input
                  id="codex-project-name"
                  autoFocus
                  maxLength={PROJECT_NAME_MAX}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="codex-project-kind">Kind</Label>
                  <Select value={draft.kind} onValueChange={(v) => (isProjectKind(v) ? setDraft((d) => ({ ...d, kind: v })) : undefined)}>
                    <SelectTrigger id="codex-project-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="codex-project-mba">MBA (optional)</Label>
                  <Input
                    id="codex-project-mba"
                    maxLength={MBA_NUMBER_MAX}
                    value={draft.mba_number}
                    onChange={(e) => setDraft((d) => ({ ...d, mba_number: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="codex-project-client">Client (optional)</Label>
                <Combobox
                  id="codex-project-client"
                  options={clientOptions}
                  preserveOrder
                  value={draft.client_id || NO_CLIENT}
                  onValueChange={(v) => setDraft((d) => ({ ...d, client_id: v === NO_CLIENT ? "" : v }))}
                  placeholder="No client"
                  searchPlaceholder="Search clients…"
                  emptyText="No clients found."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="codex-project-owner">Owner</Label>
                <Select value={draft.owner_email} onValueChange={(v) => setDraft((d) => ({ ...d, owner_email: v }))}>
                  <SelectTrigger id="codex-project-owner">
                    <SelectValue placeholder="You" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeMembers.map((m) => (
                      <SelectItem key={m.email} value={m.email.toLowerCase()}>
                        {rosterDisplayName({ name: m.name, email: m.email })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.is_private}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, is_private: v === true }))}
                  aria-label="Private project"
                />
                Private: only the owner, you and members see the project
              </label>
              {draft.is_private ? (
                <p className="text-xs text-muted-foreground">Its tasks show only to the owner, you and members, everywhere in Tasks.</p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!draft.name.trim() || saving}>
                  Create project
                </Button>
              </DialogFooter>
            </form>
          </ComboboxModalProvider>
        </DialogContent>
      </Dialog>
    </div>
  )
}
