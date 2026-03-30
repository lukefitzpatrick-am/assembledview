import React from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface OutcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  outcome: string;
  isLoading?: boolean;
}

export function OutcomeModal({
  isOpen,
  onClose,
  title,
  outcome,
  isLoading = false,
}: OutcomeModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center">
              <Image
                src="/amlogo.png"
                alt="Assembled Media Logo"
                width={200}
                height={60}
                className="mb-4"
              />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{title}</h3>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="rounded-md bg-muted p-4 font-mono text-sm whitespace-pre-wrap">
                {outcome}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 