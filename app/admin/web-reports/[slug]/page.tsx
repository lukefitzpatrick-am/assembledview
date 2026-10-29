import React from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { WebReportBuilderScreen } from "@/components/dashboard/web/WebReportBuilderScreen"
import { auth0 } from "@/lib/auth0"
import { resolveAdminWebReportEdit } from "@/lib/webReport/admin/access"
import { loadBuilderDraft } from "@/lib/webReport/builder/repo"
import { DEFAULT_WEB_REPORT_LAYOUT } from "@/lib/webReport/elements"

export const dynamic = "force-dynamic"

export default async function AdminWebReportEditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await auth0.getSession()
  const returnTo = `/admin/web-reports/${encodeURIComponent(slug)}`
  const opened = await resolveAdminWebReportEdit({
    slug,
    user: session?.user,
    load: (next) => loadBuilderDraft(next, DEFAULT_WEB_REPORT_LAYOUT),
  })
  if (opened.kind === "login") {
    redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
  }
  if (opened.kind === "redirect") redirect("/dashboard")
  if (opened.kind === "missing") notFound()

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/web-reports" className="text-sm text-muted-foreground">
        Analytics
      </Link>
      <WebReportBuilderScreen slug={slug} draft={opened.draft} />
    </div>
  )
}
