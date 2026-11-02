"use client"

import Image from "next/image"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Check, Minus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LoadingDots } from "@/components/ui/loading-dots"
import {
  savingDialogAllComplete,
  savingDialogHasErrors,
} from "@/lib/docs/saveDocSteps"
import { savingModalChromeForItems } from "@/lib/auth/writeSessionExpiry"
import { APP_ASSET_BASE_URL } from "@/lib/config/endpoints"

const SAVING_MODAL_GIF_SRC = `${APP_ASSET_BASE_URL}/Data%20Sophistication-qgeiUdEIVkx6q4ceYsDFi1w38pwqjv.gif`

export interface SaveStatusItem {
  name: string;
  status: 'pending' | 'success' | 'error' | 'skipped';
  error?: string;
}

interface SavingModalProps {
  isOpen: boolean;
  items?: SaveStatusItem[];
  isSaving?: boolean;
  onClose?: () => void;
  title?: string;
  titleComplete?: string;
  titleWithErrors?: string;
  descriptionSaving?: string;
  descriptionComplete?: string;
  descriptionError?: string;
  emptyStateLabel?: string;
}

export function SavingModal({
  isOpen,
  items = [],
  isSaving = false,
  onClose,
  title = "Saving Changes",
  titleComplete = "Saving Complete",
  titleWithErrors = "Saving with Errors",
  descriptionSaving = "We are saving your changes. This may take a moment.",
  descriptionComplete = "All sections have been processed.",
  descriptionError = "Some sections failed to save. Review the errors below and fix them before retrying.",
  emptyStateLabel = "Saving changes...",
}: SavingModalProps) {
  const hasItems = items.length > 0;
  const allComplete = savingDialogAllComplete(items);
  const hasErrors = savingDialogHasErrors(items);
  const sessionChrome = savingModalChromeForItems(items);
  const resolvedTitleWithErrors = sessionChrome.titleWithErrors ?? titleWithErrors;
  const resolvedDescriptionError = sessionChrome.descriptionError ?? descriptionError;
  const canClose = !isSaving;
  const dialogTitle = hasErrors
    ? resolvedTitleWithErrors
    : allComplete
      ? titleComplete
      : title;

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
        <div className="flex flex-col gap-4 p-6">
        <DialogTitle className="text-lg font-semibold">{dialogTitle}</DialogTitle>
        {hasItems && (
          <DialogDescription className={cn("text-sm", hasErrors ? "text-destructive" : "text-muted-foreground")}>
            {hasErrors
              ? resolvedDescriptionError
              : isSaving
                ? descriptionSaving
                : descriptionComplete}
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
                  item.status === 'success' && "bg-pacing-ahead-bg",
                  item.status === 'skipped' && "bg-muted/40"
                )}
              >
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {item.status === 'pending' && (
                    <LoadingDots size="sm" dotClassName="bg-muted-foreground" aria-label="Saving" />
                  )}
                  {item.status === 'success' && (
                    <Check className="w-5 h-5 text-status-ahead-fg" />
                  )}
                  {item.status === 'error' && (
                    <X className="w-5 h-5 text-destructive" />
                  )}
                  {item.status === 'skipped' && (
                    <Minus className="w-5 h-5 text-muted-foreground" aria-label="Skipped" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {item.name}
                    {item.status === 'skipped' ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Skipped
                      </span>
                    ) : null}
                  </div>
                  {item.status === 'error' && item.error && (
                    <div className="text-xs text-destructive mt-1">{item.error}</div>
                  )}
                  {item.status === 'skipped' && item.error && (
                    <div className="text-xs text-muted-foreground mt-1">{item.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4">
            <Image
              src={SAVING_MODAL_GIF_SRC}
              alt="Saving..."
              width={64}
              height={64}
              unoptimized
              className="h-16 w-16"
            />
            <DialogDescription className="text-lg font-semibold text-foreground">
              {emptyStateLabel}
            </DialogDescription>
          </div>
        )}

        {(hasErrors || (!isSaving && allComplete)) && (
          <div className="flex justify-end gap-2">
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
