"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { helpRosterOptions } from "@/lib/codex/helpRoster"
import { ASK_HELP_MAX_CHARS, type CodexTask, type TeamMember } from "@/lib/codex/types"

export function CampaignAskHelpDialog({
  mba,
  open,
  onOpenChange,
}: {
  mba: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [meEmail, setMeEmail] = useState<string | null>(null)
  const [task, setTask] = useState<CodexTask | null>(null)
  const [assigneeEmail, setAssigneeEmail] = useState("")
  const [ask, setAsk] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([
      fetch("/api/codex/team", { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/codex/tasks?mba_number=${encodeURIComponent(mba)}&per_page=20`, {
        credentials: "include",
      }).then((r) => r.json()),
    ])
      .then(([teamJson, tasksJson]) => {
        if (cancelled) return
        const team = Array.isArray(teamJson?.items)
          ? teamJson.items
          : Array.isArray(teamJson?.members)
            ? teamJson.members
            : Array.isArray(teamJson)
              ? teamJson
              : []
        setMembers(team)
        setMeEmail(typeof teamJson?.meEmail === "string" ? teamJson.meEmail : null)
        const items = Array.isArray(tasksJson?.items) ? tasksJson.items : []
        const parent = items.find((row: CodexTask) => row.parent_task_id == null) ?? items[0] ?? null
        setTask(parent)
      })
      .catch(() => {
        if (!cancelled) setTask(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, mba])

  const options = useMemo(() => helpRosterOptions(members, meEmail), [members, meEmail])

  const send = async () => {
    if (!task) return
    const email = assigneeEmail.trim()
    const body = ask.trim()
    if (!email || !body) return
    setSending(true)
    try {
      const res = await fetch(`/api/codex/tasks/${task.id}/help`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assignee_email: email, ask: body }),
      })
      if (!res.ok) throw new Error("Could not ask for help.")
      toast({ title: "Help requested", description: `Asked ${email}.` })
      onOpenChange(false)
      setAsk("")
      setAssigneeEmail("")
    } catch (error) {
      toast({
        title: "Could not ask for help",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer="nested" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ask for help</DialogTitle>
        </DialogHeader>
        {!task ? (
          <p className="text-sm text-muted-foreground">
            No Codex task is attached to {mba}. Open Tasks to create one, then ask for help from there.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-help-assignee">Team member</Label>
              <Select value={assigneeEmail} onValueChange={setAssigneeEmail}>
                <SelectTrigger id="campaign-help-assignee">
                  <SelectValue placeholder="Choose someone" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((member) => (
                    <SelectItem key={member.id} value={member.email}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-help-ask">What do you need?</Label>
              <Input
                id="campaign-help-ask"
                value={ask}
                maxLength={ASK_HELP_MAX_CHARS}
                onChange={(event) => setAsk(event.target.value)}
                placeholder="One-line ask"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            onClick={() => void send()}
            disabled={!task || sending || !assigneeEmail.trim() || !ask.trim()}
          >
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
