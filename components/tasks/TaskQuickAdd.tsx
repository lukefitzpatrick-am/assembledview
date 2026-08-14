"use client"

import { useMemo, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  parseQuickAdd,
  type QuickAddClient,
  type QuickAddTeamMember,
} from "@/lib/codex/quickAddParse"
import { cn } from "@/lib/utils"

type Props = {
  team: QuickAddTeamMember[]
  clients: QuickAddClient[]
  defaultAssigneeEmail: string | null
  defaultAssigneeName: string | null
  fallbackClientId: number | null
  fallbackClientLabel: string | null
  /** Clients list failed — block submit (fail-soft). */
  clientsUnavailable: boolean
  onCreate: (payload: {
    title: string
    client_id: number
    status: "todo"
    priority: "low" | "normal" | "high"
    assignee_email: string | null
    assignee_name: string | null
    due_date: string | null
    estimated_minutes: number | null
  }) => Promise<void>
}

export function TaskQuickAdd({
  team,
  clients,
  defaultAssigneeEmail,
  defaultAssigneeName,
  fallbackClientId,
  fallbackClientLabel,
  clientsUnavailable,
  onCreate,
}: Props) {
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const parsed = useMemo(
    () =>
      parseQuickAdd({
        text,
        team,
        clients,
        defaultAssigneeEmail,
        defaultAssigneeName,
        fallbackClientId,
        fallbackClientLabel,
      }),
    [
      text,
      team,
      clients,
      defaultAssigneeEmail,
      defaultAssigneeName,
      fallbackClientId,
      fallbackClientLabel,
    ]
  )

  const canSubmit =
    !clientsUnavailable &&
    parsed.title.length > 0 &&
    parsed.clientId != null &&
    !submitting

  const submit = async () => {
    if (!canSubmit || parsed.clientId == null) return
    setSubmitting(true)
    try {
      await onCreate({
        title: parsed.title,
        client_id: parsed.clientId,
        status: "todo",
        priority: parsed.priority,
        assignee_email: parsed.assigneeEmail,
        assignee_name: parsed.assigneeName,
        due_date: parsed.dueDate,
        estimated_minutes: parsed.estimatedMinutes,
      })
      setText("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-2 rounded-card border border-border bg-card p-3 shadow-e1">
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder='Quick add — e.g. "Chase deck @luke #woolworths !high due friday"'
          disabled={submitting || clientsUnavailable}
          aria-label="Quick add task"
          className="h-10"
        />
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          aria-label="Create task"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>
      {clientsUnavailable ? (
        <p className="text-xs text-status-critical-fg">
          Client list unavailable — quick-add is paused until clients load.
        </p>
      ) : text.trim() ? (
        <div className="flex flex-wrap gap-1.5">
          {parsed.title ? (
            <Badge variant="outline" size="sm" className="font-normal">
              Title: {parsed.title}
            </Badge>
          ) : (
            <Badge variant="outline" size="sm" className="text-status-critical-fg">
              Title needed
            </Badge>
          )}
          {parsed.chips.map((chip, i) => (
            <Badge
              key={`${chip.kind}-${i}-${chip.label}`}
              variant={chip.ok ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "font-normal",
                !chip.ok && "border-status-critical-fg/40 text-status-critical-fg"
              )}
            >
              {chip.label}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Enter creates a todo assigned to you. Use @assignee #client !high/!low
          due tomorrow or ~2h — unmatched tokens stay in the title.
        </p>
      )}
    </div>
  )
}
