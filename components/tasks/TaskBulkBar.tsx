"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SingleDatePicker } from "@/components/ui/single-date-picker"
import { STATUSES, type TaskStatus, type TeamMember } from "@/lib/codex/types"
import { isValid } from "date-fns"

const UNASSIGNED = "__unassigned__"

type Props = {
  count: number
  teamMembers: TeamMember[]
  busy: boolean
  onClear: () => void
  onSetStatus: (status: TaskStatus) => Promise<void>
  onSetAssignee: (email: string | null, name: string | null) => Promise<void>
  onSetDueDate: (dueDate: string | null) => Promise<void>
}

function dueToYmd(d: Date | null | undefined): string | null {
  if (!d || !isValid(d)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function TaskBulkBar({
  count,
  teamMembers,
  busy,
  onClear,
  onSetStatus,
  onSetAssignee,
  onSetDueDate,
}: Props) {
  const [status, setStatus] = useState<string>("")
  const [assignee, setAssignee] = useState<string>("")
  const [due, setDue] = useState<Date | null>(null)

  const active = teamMembers.filter((m) => m.active)

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-3 shadow-e1 sm:flex-row sm:flex-wrap sm:items-end">
      <p className="text-sm font-medium text-foreground">
        <span className="num">{count}</span> selected
      </p>

      <div className="space-y-1.5">
        <Label>Set status</Label>
        <div className="flex gap-2">
          <Select value={status || undefined} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[10rem]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={busy || !status}
            onClick={() => {
              if (status) void onSetStatus(status as TaskStatus)
            }}
          >
            Apply
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Set assignee</Label>
        <div className="flex gap-2">
          <Select value={assignee || undefined} onValueChange={setAssignee}>
            <SelectTrigger className="h-9 w-[12rem]">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {active.map((m) => (
                <SelectItem key={m.id} value={m.email}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={busy || !assignee}
            onClick={() => {
              if (!assignee) return
              if (assignee === UNASSIGNED) {
                void onSetAssignee(null, null)
                return
              }
              const m = active.find((x) => x.email === assignee)
              void onSetAssignee(assignee, m?.name ?? null)
            }}
          >
            Apply
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Set due date</Label>
        <div className="flex gap-2">
          <SingleDatePicker value={due} onChange={(d) => setDue(d ?? null)} />
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void onSetDueDate(dueToYmd(due))}
          >
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDue(null)
              void onSetDueDate(null)
            }}
          >
            Clear due
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:ml-auto">
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={busy}>
          Clear selection
        </Button>
      </div>
    </div>
  )
}
