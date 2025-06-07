"use client"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"

interface SuccessModalProps {
  isOpen: boolean
  onClose: () => void
  message: string
}

export function SuccessModal({ isOpen, onClose, message }: SuccessModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] flex flex-col items-center justify-center min-h-[200px] gap-4 bg-background border-2 border-success">
        <DialogTitle className="sr-only">Success</DialogTitle>
        <CheckCircle className="w-16 h-16 text-success" />
        <DialogDescription className="text-lg font-semibold text-center text-foreground">{message}</DialogDescription>
        <Button onClick={onClose} className="bg-success hover:bg-success-hover text-white">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  )
}

