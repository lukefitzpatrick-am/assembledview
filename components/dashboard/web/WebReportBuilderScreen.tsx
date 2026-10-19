import { ReportBuilder } from "@/components/dashboard/web/ReportBuilder"
import type { BuilderDraft } from "@/lib/webReport/builder/repo"

export function WebReportBuilderScreen({
  slug,
  draft,
}: {
  slug: string
  draft: BuilderDraft
}) {
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
      keyEventNames={draft.keyEventNames}
    />
  )
}
