"use client"

import { useState } from "react"
import { Bookmark, Check, ChevronDown, Pencil, Share2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SAVED_VIEW_NAME_MAX, type CodexSavedView } from "@/lib/codex/savedViews"

type DialogState =
  | { mode: "save" }
  | { mode: "rename"; view: CodexSavedView }
  | { mode: "delete"; view: CodexSavedView }
  | null

/**
 * Codex saved views menu (F8, switch `codex_saved_views`). The page renders
 * it only when the switch is on (it needs migration 0117) and the views
 * loaded.
 */
export function SavedViewsMenu({
  views,
  activeViewId,
  activeViewEdited,
  onPick,
  onSave,
  onRename,
  onSetShared,
  onDelete,
}: {
  views: CodexSavedView[]
  activeViewId: number | null
  activeViewEdited: boolean
  onPick: (view: CodexSavedView) => void
  onSave: (input: { name: string; shared: boolean }) => Promise<boolean>
  onRename: (view: CodexSavedView, name: string) => Promise<boolean>
  onSetShared: (view: CodexSavedView, shared: boolean) => Promise<boolean>
  onDelete: (view: CodexSavedView) => Promise<boolean>
}) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const [name, setName] = useState("")
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)

  const active = views.find((v) => v.id === activeViewId) ?? null
  const mine = views.filter((v) => v.mine)
  const others = views.filter((v) => !v.mine)

  const open = (next: DialogState) => {
    setDialog(next)
    setName(next && next.mode === "rename" ? next.view.name : "")
    setShared(false)
  }

  const submit = async () => {
    if (!dialog || busy) return
    setBusy(true)
    try {
      let ok = false
      if (dialog.mode === "save") ok = await onSave({ name, shared })
      else if (dialog.mode === "rename") ok = await onRename(dialog.view, name)
      else ok = await onDelete(dialog.view)
      if (ok) setDialog(null)
    } finally {
      setBusy(false)
    }
  }

  const item = (view: CodexSavedView) => (
    <DropdownMenuItem key={view.id} onSelect={() => onPick(view)}>
      <span className="flex w-full items-center gap-2">
        {view.id === activeViewId ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <span className="h-3.5 w-3.5" aria-hidden />
        )}
        <span className="truncate">{view.name}</span>
        {view.mine && view.shared ? (
          <Share2 className="ml-auto h-3 w-3 text-muted-foreground" aria-label="Shared" />
        ) : null}
      </span>
    </DropdownMenuItem>
  )

  const nameValid = name.trim().length > 0 && name.trim().length <= SAVED_VIEW_NAME_MAX

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label="Saved views">
            <Bookmark className="mr-2 h-4 w-4" aria-hidden />
            <span className="max-w-[16rem] truncate">
              {active ? active.name : "Views"}
              {active && activeViewEdited ? " (edited)" : ""}
            </span>
            <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Your views</DropdownMenuLabel>
          {mine.length > 0 ? (
            mine.map(item)
          ) : (
            <p className="px-2 py-1 text-xs text-muted-foreground">None saved yet.</p>
          )}
          {others.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Shared by others</DropdownMenuLabel>
              {others.map(item)}
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => open({ mode: "save" })}>
            <Bookmark className="mr-2 h-3.5 w-3.5" aria-hidden />
            Save current filters as a view
          </DropdownMenuItem>
          {active && active.mine ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="truncate">{active.name}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => open({ mode: "rename", view: active })}>
                <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onSetShared(active, !active.shared)}>
                <Share2 className="mr-2 h-3.5 w-3.5" aria-hidden />
                {active.shared ? "Stop sharing" : "Share with the team"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => open({ mode: "delete", view: active })}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog != null} onOpenChange={(o) => (o ? null : setDialog(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "save"
                ? "Save view"
                : dialog?.mode === "rename"
                  ? "Rename view"
                  : "Delete view"}
            </DialogTitle>
          </DialogHeader>
          {dialog?.mode === "delete" ? (
            <p className="text-sm">
              Delete “{dialog.view.name}”?{" "}
              {dialog.view.shared ? "People it is shared with lose it too." : ""}
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (nameValid) void submit()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="codex-view-name">Name</Label>
                <Input
                  id="codex-view-name"
                  autoFocus
                  value={name}
                  maxLength={SAVED_VIEW_NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {dialog?.mode === "save" ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Saves the current filters, sort and list or board layout.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={shared} onCheckedChange={(v) => setShared(v === true)} />
                    Share with the team
                  </label>
                </>
              ) : null}
            </form>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={dialog?.mode === "delete" ? "destructive" : "default"}
              disabled={busy || (dialog?.mode !== "delete" && !nameValid)}
              onClick={() => void submit()}
            >
              {dialog?.mode === "delete" ? "Delete" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
