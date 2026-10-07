import { Suspense } from "react"
import { TasksPageClient } from "../TasksPageClient"
import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { EmptyState } from "@/components/ui/states"
import { Badge } from "@/components/ui/badge"
import { isCodexV2Enabled } from "@/lib/codex/flag"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/tasks/[id]")

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function TaskDetailPage({ params, searchParams }: PageProps) {
  if (!isCodexV2Enabled()) {
    return (
      <PageShell width="standard">
        <PageHeader
          title="Codex"
          lede="Internal task ops for the Assembled Media team."
          meta={<Badge variant="secondary" size="sm">shadow</Badge>}
        />
        <EmptyState
          title="Codex is not enabled"
          message="Set CODEX_V2=on in the server environment to turn on the Postgres-native Codex module."
        />
      </PageShell>
    )
  }

  const [{ id: idRaw }, initialSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ])
  const taskId = Number(idRaw)
  const overlayTaskId =
    Number.isFinite(taskId) && taskId >= 1 ? taskId : null

  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-3 px-6 py-12">
          <div className="relative h-5 w-5">
            <div className="absolute inset-0 rounded-full border-2 border-muted" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
          </div>
          <span className="text-sm text-muted-foreground">Loading Codex…</span>
        </div>
      }
    >
      <TasksPageClient
        overlayTaskId={overlayTaskId}
        initialSearchParams={initialSearchParams}
      />
    </Suspense>
  )
}
