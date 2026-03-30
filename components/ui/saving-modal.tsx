"use client"

import Image from "next/image"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LoadingDots } from "@/components/ui/loading-dots"

export interface SaveStatusItem {
  name: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

interface SavingModalProps {
  isOpen: boolean;
  items?: SaveStatusItem[];
  isSaving?: boolean;
  onClose?: () => void;
}

export function SavingModal({ isOpen, items = [], isSaving = false, onClose }: SavingModalProps) {
  const hasItems = items.length > 0;
  const allComplete = items.length > 0 && items.every(item => item.status !== 'pending');
  const hasErrors = items.some(item => item.status === 'error');
  const canClose = !isSaving;

  const handleClose = () => {
    if (!canClose) return;
    onClose?.();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="flex min-h-[200px] flex-col overflow-hidden border-2 border-secondary bg-background p-0 sm:max-w-[500px]">
        <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
        <div className="flex flex-col gap-4 p-6">
        <DialogTitle className="text-lg font-semibold">
          {hasErrors ? "Saving with Errors" : allComplete ? "Saving Complete" : "Saving Changes"}
        </DialogTitle>
        {hasItems && (
          <DialogDescription className={cn("text-sm", hasErrors ? "text-destructive" : "text-muted-foreground")}>
            {hasErrors
              ? "Some sections failed to save. Review the errors below and fix them before retrying."
              : isSaving
                ? "We are saving your changes. This may take a moment."
                : "All sections have been processed."}
          </DialogDescription>
        )}
        
        {hasItems ? (
          <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
            {items.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-md",
                  item.status === 'error' && "bg-destructive/10",
                  item.status === 'success' && "bg-green-500/10"
                )}
              >
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {item.status === 'pending' && (
                    <LoadingDots size="sm" dotClassName="bg-muted-foreground" aria-label="Saving" />
                  )}
                  {item.status === 'success' && (
                    <Check className="w-5 h-5 text-green-600" />
                  )}
                  {item.status === 'error' && (
                    <X className="w-5 h-5 text-destructive" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.name}</div>
                  {item.status === 'error' && item.error && (
                    <div className="text-xs text-destructive mt-1">{item.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4">
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Data%20Sophistication-qgeiUdEIVkx6q4ceYsDFi1w38pwqjv.gif"
              alt="Saving..."
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16"
            />
            <DialogDescription className="text-lg font-semibold text-foreground">
              Saving changes...
            </DialogDescription>
          </div>
        )}

        {(hasErrors || (!isSaving && allComplete)) && (
          <div className="flex justify-end">
            <Button
              variant={hasErrors ? "destructive" : "outline"}
              size="sm"
              onClick={handleClose}
              disabled={!canClose}
            >
              {hasErrors ? "Dismiss" : "Close"}
            </Button>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

