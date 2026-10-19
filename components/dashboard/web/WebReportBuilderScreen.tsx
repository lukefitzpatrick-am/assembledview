"use client"

import { useState } from "react"

import { ReportBuilder } from "@/components/dashboard/web/ReportBuilder"
import { KpiEditor } from "@/components/dashboard/web/kpis/KpiEditor"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BuilderDraft } from "@/lib/webReport/builder/repo"

export function WebReportBuilderScreen({
  slug,
  draft,
}: {
  slug: string
  draft: BuilderDraft
}) {
  const [kpiRevision, setKpiRevision] = useState(0)
  const [kpisOpened, setKpisOpened] = useState(false)
  return (
    <Tabs
      defaultValue="builder"
      className="w-full"
      onValueChange={(value) => {
        if (value === "kpis") setKpisOpened(true)
      }}
    >
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 sm:px-6">
        <TabsList>
          <TabsTrigger value="builder">Report builder</TabsTrigger>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
        </TabsList>
      </div>
      {/* Both panels stay mounted so unsaved builder edits survive a tab switch. */}
      <TabsContent value="builder" forceMount className="mt-0 data-[state=inactive]:hidden">
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
          kpiRevision={kpiRevision}
        />
      </TabsContent>
      <TabsContent value="kpis" forceMount className="data-[state=inactive]:hidden">
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-6 sm:px-6">
          {kpisOpened ? (
            <KpiEditor slug={slug} onChanged={() => setKpiRevision((current) => current + 1)} />
          ) : null}
        </div>
      </TabsContent>
    </Tabs>
  )
}
