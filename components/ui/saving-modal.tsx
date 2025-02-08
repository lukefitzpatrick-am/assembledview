"use client"

import { Dialog, DialogContent, DialogDescription } from "@/components/ui/dialog"

interface SavingModalProps {
  isOpen: boolean
}

export function SavingModal({ isOpen }: SavingModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[425px] flex flex-col items-center justify-center min-h-[200px] gap-4 bg-background border-2 border-secondary">
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Data%20Sophistication-qgeiUdEIVkx6q4ceYsDFi1w38pwqjv.gif"
          alt="Saving..."
          className="w-16 h-16"
        />
        <DialogDescription className="text-lg font-semibold text-foreground">Saving changes...</DialogDescription>
      </DialogContent>
    </Dialog>
  )
}

