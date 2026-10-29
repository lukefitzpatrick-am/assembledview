"use client"

import { useState } from "react"
import { Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthContext } from "@/contexts/AuthContext"
import { ViewAsStartForm, type ViewAsClientOption } from "@/components/view-as/ViewAsStartForm"

export function ViewAsDialog({
  open,
  onOpenChange,
  fixedClient = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fixedClient?: ViewAsClientOption | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>View as client</DialogTitle>
          <DialogDescription>Simulate the client&apos;s view for a demo. Read-only, and it ends on its own.</DialogDescription>
        </DialogHeader>
        {open ? <ViewAsStartForm fixedClient={fixedClient} onCancel={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

/** Client hub admin rail button. Hidden unless VIEW_AS_ENABLED and the viewer is an admin (not already viewing). */
export function ViewAsStartButton({ slug, clientName }: { slug: string; clientName: string }) {
  const { isAdmin, viewAsEnabled } = useAuthContext()
  const [open, setOpen] = useState(false)
  if (!isAdmin || !viewAsEnabled) return null
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="view-as-start-button">
        <Eye className="mr-2 h-4 w-4" aria-hidden />
        View as client
      </Button>
      <ViewAsDialog open={open} onOpenChange={setOpen} fixedClient={{ slug, name: clientName }} />
    </>
  )
}
