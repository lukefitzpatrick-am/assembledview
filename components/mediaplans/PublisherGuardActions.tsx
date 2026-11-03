"use client"

import { useState } from "react"
import { PlusCircle } from "lucide-react"

import { AddPublisherForm, type CreatedPublisher } from "@/components/AddPublisherForm"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  missingPublisherShortcuts,
  type MissingPublisherShortcut,
  type PublisherGuardFinding,
} from "@/lib/mediaplan/publisherGuard"

/**
 * B19 Q4 admin shortcut: one "Add to Publishers" button per typed name the
 * publisher guard blocked. Opens the Publishers create form (same POST
 * /api/publishers, admin only) with the name and the channel flags filled in,
 * so an admin can add it and publish again without leaving the plan.
 * Renders nothing for non-admins or when no typed name is blocked.
 */
export function PublisherGuardActions(props: {
  blocked: readonly PublisherGuardFinding[]
  isAdmin: boolean
  onPublisherAdded: (created: CreatedPublisher | undefined, shortcut: MissingPublisherShortcut) => void
}) {
  const [open, setOpen] = useState<MissingPublisherShortcut | null>(null)
  if (!props.isAdmin) return null
  const shortcuts = missingPublisherShortcuts(props.blocked)
  if (shortcuts.length === 0) return null

  return (
    <div className="mt-3 space-y-1.5" data-testid="publisher-guard-actions">
      <p className="text-[11px] text-muted-foreground">
        Admin: add a missing publisher, then publish again. Keep the name as typed, or the line still won&apos;t match.
      </p>
      {shortcuts.map((shortcut) => (
        <Button
          key={shortcut.name}
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full justify-start whitespace-normal text-left"
          onClick={() => setOpen(shortcut)}
        >
          <PlusCircle className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">Add &quot;{shortcut.name}&quot; to Publishers</span>
        </Button>
      ))}
      <Dialog open={open != null} onOpenChange={(next) => (next ? undefined : setOpen(null))}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>Add to Publishers</DialogTitle>
              <DialogDescription>
                The plan names &quot;{open?.name}&quot;, which isn&apos;t in Publishers. Set the publisher ID, billing agency and finance code, then create it.
              </DialogDescription>
            </DialogHeader>
            {open ? (
              <AddPublisherForm
                key={open.name}
                initialValues={{
                  publisher_name: open.name,
                  ...Object.fromEntries(open.flags.map((flag) => [flag, true])),
                }}
                onSuccess={(created) => {
                  const shortcut = open
                  setOpen(null)
                  props.onPublisherAdded(created, shortcut)
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
