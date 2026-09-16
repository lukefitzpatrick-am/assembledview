"use client"

import { useMemo, useState, type MouseEvent, type PointerEvent } from "react"
import { HandHelping } from "lucide-react"
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
import {
  ASK_HELP_MAX_CHARS,
  type CodexTask,
  type TeamMember,
} from "@/lib/codex/types"

type HelpResponse = {
  parent: CodexTask
  child: CodexTask
}

export function TaskAskHelpButton({
  task,
  members,
  meEmail,
  onAsked,
  layer = "modal",
}: {
  task: CodexTask
  members: TeamMember[]
  meEmail: string | null
  onAsked?: (result: HelpResponse) => void
  layer?: "modal" | "nested"
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [assigneeEmail, setAssigneeEmail] = useState("")
  const [ask, setAsk] = useState("")
  const [sending, setSending] = useState(false)

  const options = useMemo(
    () => helpRosterOptions(members, meEmail),
    [members, meEmail]
  )

  const isChild = task.parent_task_id != null
  if (isChild || options.length === 0) return null

  const stopCard = (event: MouseEvent | PointerEvent) => {
    event.stopPropagation()
  }

  const reset = () => {
    setAssigneeEmail("")
    setAsk("")
  }

  const send = async () => {
    const email = assigneeEmail.trim()
    const body = ask.trim()
    if (!email || !body) return
    setSending(true)
    try {
      const res = await fetch(`/api/codex/tasks/${task.id}/help`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee_email: email, ask: body }),
      })
      const json = (await res.json().catch(() => null)) as
        | HelpResponse
        | { message?: string }
        | null
      if (!res.ok) {
        throw new Error(
          json && "message" in json && typeof json.message === "string"
            ? json.message
            : "Could not ask for help."
        )
      }
      const result = json as HelpResponse
      toast({ title: "Help requested", description: `Asked ${email}.` })
      setOpen(false)
      reset()
      onAsked?.(result)
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
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground"
        aria-label="Ask for help"
        title="Ask for help"
        onPointerDown={stopCard}
        onClick={(event) => {
          stopCard(event)
          setOpen(true)
        }}
      >
        <HandHelping className="h-4 w-4" aria-hidden />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent
          layer={layer}
          className="sm:max-w-md"
          onPointerDown={stopCard}
          onClick={stopCard}
        >
          <DialogHeader>
            <DialogTitle>Ask for help</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="help-assignee">Team member</Label>
              <Select value={assigneeEmail} onValueChange={setAssigneeEmail}>
                <SelectTrigger id="help-assignee">
                  <SelectValue placeholder="Choose someone" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((m) => (
                    <SelectItem key={m.id} value={m.email}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="help-ask">What do you need?</Label>
              <Input
                id="help-ask"
                value={ask}
                maxLength={ASK_HELP_MAX_CHARS}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="One-line ask"
              />
              <p className="num text-xs text-muted-foreground">
                {ask.trim().length}/{ASK_HELP_MAX_CHARS}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => void send()}
              disabled={sending || !assigneeEmail.trim() || !ask.trim()}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
