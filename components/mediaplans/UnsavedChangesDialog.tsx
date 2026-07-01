"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface UnsavedChangesDialogProps {
  open: boolean
  onStay: () => void
  onSave: () => void | Promise<void>
  onLeave: () => void
  isSaving: boolean
}

export function UnsavedChangesDialog({ open, onStay, onSave, onLeave, isSaving }: UnsavedChangesDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onStay()
        }
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <div className="h-1 bg-gradient-to-r from-pacing-behind via-pacing-behind/70 to-pacing-behind/40" />
        <div className="p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Save your campaign before leaving or continue without saving.
            </DialogDescription>
          </DialogHeader>
          <p className="mt-3 text-sm text-muted-foreground">
            Leaving now will discard any unsaved edits to this media plan.
          </p>
          <DialogFooter className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={onStay}>
              No, stay on page
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={isSaving}
              onClick={async () => {
                onStay()
                await onSave()
              }}
            >
              {isSaving ? "Saving..." : "Save campaign"}
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={onLeave}>
              Yes, leave without saving
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
