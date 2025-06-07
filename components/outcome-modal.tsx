import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"

interface OutcomeModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  outcome: string
  isLoading: boolean
}

export function OutcomeModal({
  isOpen,
  onClose,
  title,
  outcome,
  isLoading
}: OutcomeModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-6">
          {isLoading ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-center text-sm text-muted-foreground">{outcome}</p>
            </div>
          ) : (
            <p className="text-center text-sm">{outcome}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 