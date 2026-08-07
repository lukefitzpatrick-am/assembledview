import { Suspense } from "react"
import { TaskDetailClient } from "@/components/tasks/TaskDetailClient"
import { EmptyState } from "@/components/ui/states"
import { Badge } from "@/components/ui/badge"
import { isCodexV2Enabled } from "@/lib/codex/flag"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/tasks/[id]")

type PageProps = { params: Promise<{ id: string }> }

export default async function TaskDetailPage({ params }: PageProps) {
  if (!isCodexV2Enabled()) {
    return (
      <div className="w-full max-w-none space-y-6 px-4 pb-12 pt-6 md:px-6 md:pt-8">
        <div className="space-y-2">
          <h1 className="inline-flex flex-wrap items-center gap-2 text-[26px] font-extrabold tracking-tight text-foreground">
            Codex
            <Badge variant="secondary" size="sm">
              shadow
            </Badge>
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Internal task ops for the Assembled Media team.
          </p>
        </div>
        <EmptyState
          title="Codex is not enabled"
          message="Set CODEX_V2=on in the server environment to turn on the Postgres-native Codex module."
        />
      </div>
    )
  }

  const { id: idRaw } = await params
  const taskId = Number(idRaw)
  if (!Number.isFinite(taskId) || taskId < 1) {
    return (
      <div className="w-full max-w-3xl space-y-6 px-4 pb-12 pt-6 md:px-6">
        <EmptyState title="Invalid task" message="Task id must be a positive number." />
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-3 px-6 py-12">
          <div className="relative h-5 w-5">
            <div className="absolute inset-0 rounded-full border-2 border-muted" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
          </div>
          <span className="text-sm text-muted-foreground">Loading task…</span>
        </div>
      }
    >
      <TaskDetailClient taskId={taskId} />
    </Suspense>
  )
}
