import { notFound, redirect } from "next/navigation"

import { WebReportBuilderScreen } from "@/components/dashboard/web/WebReportBuilderScreen"
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

  return <WebReportBuilderScreen slug={slug} draft={draft} />
}
