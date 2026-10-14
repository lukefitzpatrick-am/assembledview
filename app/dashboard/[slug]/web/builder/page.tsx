import { notFound, redirect } from "next/navigation"

import { ReportBuilder } from "@/components/dashboard/web/ReportBuilder"
import { auth0 } from "@/lib/auth0"
import { builderGate } from "@/lib/webReport/builder/access"
import { loadBuilderDraft } from "@/lib/webReport/builder/repo"
import { DEFAULT_WEB_REPORT_LAYOUT } from "@/lib/webReport/elements"

export const dynamic = "force-dynamic"

export default async function WebReportBuilderPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await auth0.getSession()
  const gate = builderGate(session?.user)
  if (gate === "login") {
    redirect(`/auth/login?returnTo=/dashboard/${encodeURIComponent(slug)}/web/builder`)
  }
  if (gate === "not_found") notFound()

  const draft = await loadBuilderDraft(slug, DEFAULT_WEB_REPORT_LAYOUT)
  if (!draft) notFound()

  return (
    <ReportBuilder
      slug={slug}
      clientName={draft.clientName}
      migrationApplied={draft.migrationApplied}
      initialLayout={draft.layout}
      currentVersion={draft.currentVersion}
      versions={draft.versions}
      ga4PropertyRef={draft.ga4PropertyRef}
      gscSiteRef={draft.gscSiteRef}
      brandTerms={draft.brandTerms}
      defaultPeriod={draft.defaultPeriod}
      ga4Options={draft.ga4Options}
      gscOptions={draft.gscOptions}
      keyEventNames={draft.keyEventNames}
    />
  )
}
