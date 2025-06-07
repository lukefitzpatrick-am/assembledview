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
      <DialogContent className="sm:max-w-md">
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="bg-muted p-4 rounded-md whitespace-pre-wrap font-mono text-sm">
              {outcome}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 