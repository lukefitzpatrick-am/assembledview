"use client"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { XCircle } from "lucide-react"

interface ErrorModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
}

export function ErrorModal({ isOpen, onClose, title, message }: ErrorModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] flex flex-col items-center justify-center min-h-[200px] gap-4 bg-background border-2 border-destructive">
        <DialogTitle className="sr-only">Error</DialogTitle>
        <XCircle className="w-16 h-16 text-destructive" />
        <DialogDescription className="text-lg font-semibold text-center text-foreground">{title}</DialogDescription>
        <DialogDescription className="text-center text-foreground">{message}</DialogDescription>
        <Button onClick={onClose} className="bg-destructive hover:bg-destructive/90 text-white">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  )
} 