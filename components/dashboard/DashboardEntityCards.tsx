"use client"

import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { mediaChannelTagRowClassName } from "@/components/dashboard/MediaChannelTag"
import { cn } from "@/lib/utils"

/** Narrow shape for dashboard campaign rows (matches DashboardOverview local type). */
export type DashboardCampaignPlanCardModel = {
  id: number
  mp_clientname: string
  mp_campaignname: string
  mp_mba_number: string
  mp_version: number
  mp_campaignstatus: string
  mp_campaigndates_start: string
  mp_campaigndates_end: string
  mp_campaignbudget: number
}

export type DashboardScopeCardModel = {
  id: number
  client_name: string
  scope_date: string
  project_name: string
  project_status: string
  project_overview: string
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  )
}

export function DashboardCampaignPlanCard({
  plan,
  formatDate,
  formatCurrency,
  mediaTypeTags,
  showStatus,
  statusBadgeClassName,
  onEdit,
  onView,
  viewDisabled,
}: {
  plan: DashboardCampaignPlanCardModel
  formatDate: (dateString: string) => string
  formatCurrency: (amount: number) => string
  mediaTypeTags: ReactNode
  showStatus: boolean
  statusBadgeClassName: string
  onEdit: () => void
  onView: () => void
  viewDisabled: boolean
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow duration-200">
      <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
      <CardHeader className="space-y-1 pb-3 pt-4 px-5">
        <CardTitle className="text-base font-semibold leading-snug line-clamp-2">{plan.mp_campaignname}</CardTitle>
        <p className="text-sm text-muted-foreground line-clamp-2">{plan.mp_clientname}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="MBA number">{plan.mp_mba_number}</Field>
          <Field label="Version">{plan.mp_version}</Field>
          <Field label="Start date">{formatDate(plan.mp_campaigndates_start)}</Field>
          <Field label="End date">{formatDate(plan.mp_campaigndates_end)}</Field>
          <Field label="Budget" className="col-span-2">
            <span className="font-semibold text-foreground">{formatCurrency(plan.mp_campaignbudget)}</span>
          </Field>
        </div>
        {showStatus ? (
          <Field label="Status">
            <Badge className={statusBadgeClassName}>{plan.mp_campaignstatus}</Badge>
          </Field>
        ) : null}
        <Field label="Media types">
          <div className={mediaChannelTagRowClassName}>{mediaTypeTags}</div>
        </Field>
        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border/40 pt-3">
          <Button variant="outline" size="sm" className="w-full hover:bg-muted/50 transition-colors" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="secondary" size="sm" className="w-full hover:opacity-90 transition-opacity" disabled={viewDisabled} onClick={onView}>
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardScopeCard({
  scope,
  formatDate,
  statusBadgeClassName,
}: {
  scope: DashboardScopeCardModel
  formatDate: (dateString: string) => string
  statusBadgeClassName: string
}) {
  const overview = scope.project_overview?.trim() ? scope.project_overview : "N/A"
  return (
    <Card className="flex h-full flex-col overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow duration-200">
      <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
      <CardHeader className="space-y-1 pb-3 pt-4 px-5">
        <CardTitle className="text-base font-semibold leading-snug line-clamp-2">{scope.project_name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-2">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field label="Client name">{scope.client_name}</Field>
          <Field label="Scope date">{formatDate(scope.scope_date)}</Field>
        </div>
        <Field label="Project overview">
          <div className="max-w-full truncate text-muted-foreground/80" title={overview}>
            {overview}
          </div>
        </Field>
        <div className="mt-auto pt-2">
          <Field label="Status">
            <Badge className={statusBadgeClassName}>{scope.project_status}</Badge>
          </Field>
        </div>
      </CardContent>
    </Card>
  )
}

export function dashboardCampaignGridClassName(scroll: boolean) {
  return cn(
    "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
    scroll && "max-h-[1008px] overflow-y-auto pr-2 scrollbar-thin",
  )
}
