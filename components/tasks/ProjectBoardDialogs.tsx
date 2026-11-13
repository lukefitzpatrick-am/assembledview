"use client"

/**
 * Project board dialogs (B39): add or rename a section (status category
 * suggested from the name, editable) and paste tasks into a section (one
 * line per task, a preview with the count before saving, 200 at most).
 */
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { sectionCategoryLabel } from "@/lib/codex/projectBoard"
import {
  BULK_PASTE_MAX,
  isSectionStatusCategory,
  parsePastedTaskTitles,
  SECTION_NAME_MAX,
  SECTION_STATUS_CATEGORIES,
  suggestSectionCategory,
  type SectionStatusCategory,
} from "@/lib/codex/projects"
import { TASK_TITLE_MAX } from "@/lib/codex/types"

export type SectionDialogState =
  | { mode: "create" }
  | { mode: "rename"; sectionId: number; name: string }
  | null

export function SectionDialog({
  state,
  saving,
  onClose,
  onSubmit,
}: {
  state: SectionDialogState
  saving: boolean
  onClose: () => void
  onSubmit: (value: { name: string; status_category: SectionStatusCategory }) => void
}) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState<SectionStatusCategory>("todo")
  const [categoryTouched, setCategoryTouched] = useState(false)

  useEffect(() => {
    if (!state) return
    setName(state.mode === "rename" ? state.name : "")
    setCategory("todo")
    setCategoryTouched(false)
  }, [state])

  const creating = state?.mode === "create"
  const trimmed = name.trim()
  const effective = creating && !categoryTouched ? suggestSectionCategory(trimmed) : category

  return (
    <Dialog open={state != null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{creating ? "Add section" : "Rename section"}</DialogTitle>
          {creating ? (
            <DialogDescription>
              The status is suggested from the name. Cards moved into this section take it.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!trimmed || saving) return
            onSubmit({ name: trimmed, status_category: effective })
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="codex-section-name">Name</Label>
            <Input
              id="codex-section-name"
              autoFocus
              value={name}
              maxLength={SECTION_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {creating ? (
            <div className="space-y-1.5">
              <Label htmlFor="codex-section-category">Status</Label>
              <Select
                value={effective}
                onValueChange={(v) => {
                  if (isSectionStatusCategory(v)) {
                    setCategory(v)
                    setCategoryTouched(true)
                  }
                }}
              >
                <SelectTrigger id="codex-section-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_STATUS_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {sectionCategoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || saving}>
              {creating ? "Add section" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** What the paste box says before saving. */
export function pastePreviewText(text: string, sectionName: string): { message: string; canSave: boolean } {
  const parsed = parsePastedTaskTitles(text)
  if (parsed.overCap) {
    return { message: `${parsed.titles.length} lines. Paste up to ${BULK_PASTE_MAX} tasks at a time.`, canSave: false }
  }
  if (parsed.tooLong.length > 0) {
    const lines = parsed.tooLong.slice(0, 5).join(", ")
    return { message: `Line ${lines} is longer than ${TASK_TITLE_MAX} characters.`, canSave: false }
  }
  if (parsed.titles.length === 0) return { message: "One task per line. Blank lines are ignored.", canSave: false }
  const n = parsed.titles.length
  const blanks = parsed.blank > 0 ? ` ${parsed.blank} blank line${parsed.blank === 1 ? "" : "s"} ignored.` : ""
  return { message: `${n} task${n === 1 ? "" : "s"} will be added to ${sectionName}.${blanks}`, canSave: true }
}

export function BulkPasteDialog({
  sectionName,
  open,
  saving,
  onClose,
  onSubmit,
}: {
  sectionName: string
  open: boolean
  saving: boolean
  onClose: () => void
  onSubmit: (titles: string[]) => void
}) {
  const [text, setText] = useState("")
  useEffect(() => {
    if (open) setText("")
  }, [open])
  const preview = pastePreviewText(text, sectionName)
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paste tasks into {sectionName}</DialogTitle>
          <DialogDescription>One task per line. They go to the end of the section, unassigned.</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={10}
          value={text}
          aria-label={`Tasks to paste into ${sectionName}`}
          onChange={(e) => setText(e.target.value)}
        />
        <p className={preview.canSave || !text.trim() ? "text-sm text-muted-foreground" : "text-sm text-status-critical-fg"} role="status">
          {preview.message}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!preview.canSave || saving}
            onClick={() => onSubmit(parsePastedTaskTitles(text).titles)}
          >
            {saving ? "Adding…" : "Add tasks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
