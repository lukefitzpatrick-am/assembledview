"use client"

import { SavingModal, type SaveStatusItem } from "@/components/ui/saving-modal"

interface MediaPlanLoadModalProps {
  isOpen: boolean
  items?: SaveStatusItem[]
  isLoading?: boolean
  onClose?: () => void
}

export function MediaPlanLoadModal({
  isOpen,
  items = [],
  isLoading = true,
  onClose,
}: MediaPlanLoadModalProps) {
  return (
    <SavingModal
      isOpen={isOpen}
      items={items}
      isSaving={isLoading}
      onClose={onClose}
      title="Loading campaign"
      titleComplete="Campaign loaded"
      titleWithErrors="Loaded with errors"
      descriptionSaving="Loading campaign details and media sections. This may take a moment on large plans."
      descriptionComplete="All requested sections have been loaded."
      descriptionError="Some sections failed to load. You can retry individual sections below."
      emptyStateLabel="Loading campaign…"
    />
  )
}
