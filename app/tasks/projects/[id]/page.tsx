import { Suspense } from "react"

import { PageHeader } from "@/components/layout/PageHeader"
import { PageShell } from "@/components/layout/PageShell"
import { ProjectBoardClient } from "@/components/tasks/ProjectBoardClient"
import { Badge } from "@/components/ui/badge"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { isFeatureOn } from "@/lib/features/server"
import { parseId } from "@/lib/codex/projects"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/tasks/projects/[id]")

type PageProps = { params: Promise<{ id: string }> }

/**
 * A Codex project board (B39). Needs codex_projects (which needs codex_v2
 * and migration 0118). The API routes do their own
 * staff and project visibility checks.
 */
export default async function ProjectBoardPage({ params }: PageProps) {
  const [codexOn, projectsOn] = await Promise.all([isFeatureOn("codex_v2"), isFeatureOn("codex_projects")])
  if (!codexOn || !projectsOn) {
    return (
      <PageShell width="standard">
        <PageHeader
          title="Codex"
          lede="Internal task ops for the Assembled Media team."
          meta={<Badge variant="secondary" size="sm">shadow</Badge>}
        />
        <EmptyState
          title={codexOn ? "Projects are not turned on" : "Codex is not enabled"}
          message={
            codexOn
              ? "Turn on Tasks: projects and sections on Admin > Features to use project boards."
              : "Turn on Tasks (Codex) on Admin > Features to use the Postgres-native Codex module."
          }
        />
      </PageShell>
    )
  }
  const id = parseId((await params).id)
  return (
    <PageShell width="full">
      {id == null ? (
        <EmptyState title="Project not found" message="Check the link and try again." />
      ) : (
        <Suspense fallback={<LoadingState rows={6} />}>
          <ProjectBoardClient projectId={id} />
        </Suspense>
      )}
    </PageShell>
  )
}
