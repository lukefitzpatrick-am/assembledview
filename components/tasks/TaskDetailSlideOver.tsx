"use client"

import { SlideOver } from "@/components/ui/SlideOver"
import { TaskDetailClient } from "@/components/tasks/TaskDetailClient"

export function TaskDetailSlideOver({
  open,
  taskId,
  onClose,
}: {
  open: boolean
  taskId: number | null
  onClose: () => void
}) {
  return (
    <SlideOver
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Task"
      hideHeader
      overlayClassName="bg-foreground/40"
      contentClassName="sm:max-w-xl"
    >
      {open && taskId != null ? <TaskDetailClient taskId={taskId} /> : null}
    </SlideOver>
  )
}
