import {
  CampaignCardSkeleton,
  ChartSkeleton,
  HeroBannerSkeleton,
  KPICardSkeleton,
} from "@/components/dashboard/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

const LIVE_GRID_PLACEHOLDER_COUNT = 6
const UPCOMING_PLACEHOLDER_COUNT = 4

export function ClientDashboardSkeleton() {
  return (
    <div className="min-h-screen w-full bg-background">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-12 2xl:px-16">
        <section className="w-full">
          <HeroBannerSkeleton />
        </section>

        <section className="mt-6 w-full lg:mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <KPICardSkeleton key={`kpi-${index}`} />
            ))}
          </div>
        </section>

        <section className="mt-8 w-full space-y-4 lg:mt-10 lg:space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-5 w-8 rounded-full" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-36" />
          </div>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={`pill-${index}`} className="h-9 w-28 rounded-full" />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4 xl:gap-6">
            {Array.from({ length: LIVE_GRID_PLACEHOLDER_COUNT }).map((_, index) => (
              <CampaignCardSkeleton key={`live-${index}`} />
            ))}
          </div>
        </section>

        <section className="mt-8 w-full lg:mt-10">
          <div className="w-full space-y-4 lg:space-y-6 xl:space-y-8">
            <header className="flex flex-wrap items-center justify-between gap-3 md:gap-4">
              <div className="min-w-0 space-y-1">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-36" />
              </div>
              <Skeleton className="h-9 w-36 rounded-md" />
            </header>

            <div className="flex w-full flex-col gap-4 lg:gap-6">
              <ChartSkeleton />

              <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
                <ChartSkeleton />
                <ChartSkeleton />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 w-full lg:mt-10">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-32" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: UPCOMING_PLACEHOLDER_COUNT }).map((_, index) => (
                <CampaignCardSkeleton key={`upcoming-${index}`} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
