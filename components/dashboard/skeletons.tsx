"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function HeroBannerSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-frame border border-border bg-background p-6 md:p-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-pill" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-1 w-[60px] rounded-pill" />
            <Skeleton className="h-3.5 w-72 max-w-[380px]" />
            <Skeleton className="h-3.5 w-64 max-w-[380px]" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10 rounded-pill" />
          <Skeleton className="h-10 w-10 rounded-pill" />
          <Skeleton className="h-10 w-10 rounded-pill" />
        </div>
      </div>
    </div>
  )
}

export function CampaignCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <Skeleton className="h-5 w-16 rounded" />
        <Skeleton className="h-5 w-14 rounded" />
      </div>
      <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
      <div className="mt-2 flex justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-8" />
      </div>
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-muted/70 bg-card shadow-sm">
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="flex shrink-0 gap-1">
            <Skeleton className="h-8 w-14 rounded-md" />
            <Skeleton className="h-8 w-14 rounded-md" />
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 pt-0">
        <Skeleton className="h-80 w-full rounded-md" />
      </div>
    </div>
  )
}

export function KPICardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-8 w-28" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  )
}
