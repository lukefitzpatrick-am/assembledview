"use client"

import { useEffect, useState } from "react"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import type { TaskTemplate, TaskTemplateItem } from "@/lib/codex/types"

type TemplateFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: TaskTemplate | null
  onSaved: () => void
}

type DraftItem = { key: string; id?: number; label: string }

function newKey(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: TemplateFormDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [items, setItems] = useState<DraftItem[]>([])
  const [newLabel, setNewLabel] = useState("")
  const isEdit = Boolean(template)

  useEffect(() => {
    if (!open) return
    if (template) {
      setName(template.name ?? "")
      setDescription(template.description ?? "")
      const existing = (template.items ?? []).map((it: TaskTemplateItem) => ({
        key: `i-${it.id}`,
        id: it.id,
        label: it.label,
      }))
      setItems(existing)
    } else {
      setName("")
      setDescription("")
      setItems([])
    }
    setNewLabel("")
  }, [open, template])

  const addDraftLabel = () => {
    const label = newLabel.trim()
    if (!label) return
    setItems((prev) => [...prev, { key: newKey(), label }])
    setNewLabel("")
  }

  const moveItem = (index: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      const tmp = next[index]!
      next[index] = next[j]!
      next[j] = tmp
      return next
    })
  }

  const onSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast({
        title: "Name required",
        description: "Templates need a name.",
        variant: "destructive",
      })
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        name: trimmed,
        description: description.trim() || null,
        items: items.map((draft) => ({
          ...(draft.id != null ? { id: draft.id } : {}),
          label: draft.label.trim(),
        })),
      }
      const res = await fetch(
        isEdit && template
          ? `/api/codex/templates/${encodeURIComponent(String(template.id))}`
          : "/api/codex/templates",
        {
          method: isEdit && template ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          (body && typeof body === "object" && "message" in body
            ? String((body as { message?: string }).message)
            : null) ||
            (isEdit ? "Failed to update template" : "Failed to create template")
        )
      }
      toast({ title: isEdit ? "Template updated" : "Template created" })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast({
        title: "Couldn’t save template",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            A name, optional description, and ordered checklist labels. Applying
            the template copies those labels onto a new task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="EOM reporting"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">Description</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes for the team"
              rows={2}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Checklist labels</Label>
            <ul className="space-y-1.5">
              {items.map((item, index) => (
                <li
                  key={item.key}
                  className="flex items-center gap-1.5 rounded-input border border-border bg-background px-2 py-1.5"
                >
                  <span className="text-muted-foreground" aria-hidden>
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <Input
                    value={item.label}
                    onChange={(e) => {
                      const v = e.target.value
                      setItems((prev) =>
                        prev.map((p) =>
                          p.key === item.key ? { ...p, label: v } : p
                        )
                      )
                    }}
                    className="h-8 border-0 shadow-none focus-visible:ring-0"
                    disabled={submitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    disabled={submitting || index === 0}
                    onClick={() => moveItem(index, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    disabled={submitting || index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-destructive"
                    disabled={submitting}
                    onClick={() =>
                      setItems((prev) => prev.filter((p) => p.key !== item.key))
                    }
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Add a checklist label"
                disabled={submitting}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addDraftLabel()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addDraftLabel}
                disabled={submitting || !newLabel.trim()}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void onSubmit()} disabled={submitting}>
            {submitting ? "Saving…" : isEdit ? "Save template" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
