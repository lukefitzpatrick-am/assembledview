import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertCircle,
  Calendar,
  DollarSign,
  Target,
  TrendingUp,
} from 'lucide-react'
import { ClientDashboardData } from '@/lib/types/dashboard'
import { getClientDashboardData } from '@/lib/api/dashboard'
import SpendByMediaTypeChart from './components/SpendByMediaTypeChart'
import SpendByCampaignChart from './components/SpendByCampaignChart'
import MonthlySpendChart from './components/MonthlySpendChart'
import { auth0 } from '@/lib/auth0'
import { getPrimaryRole, getUserClientIdentifier } from '@/lib/rbac'

interface ClientDashboardProps {
  params: {
    slug: string
  }
}

type CampaignItem = ClientDashboardData['liveCampaignsList'][number]

function hexToRgba(hex: string, alpha: number) {
  if (!hex) {
    return null
  }

  const trimmed = hex.trim().replace('#', '')
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : trimmed

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return null
  }

  const r = Number.parseInt(expanded.slice(0, 2), 16)
  const g = Number.parseInt(expanded.slice(2, 4), 16)
  const b = Number.parseInt(expanded.slice(4, 6), 16)

  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return null
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function ClientDashboardHeader({
  clientName,
  brandColour,
}: {
  clientName: string
  brandColour?: string
}) {
  const validBrand =
    typeof brandColour === 'string' && hexToRgba(brandColour, 1) ? brandColour : undefined
  const accentStyle = validBrand ? { backgroundColor: validBrand } : undefined
  const gradientStart = validBrand ? hexToRgba(validBrand, 0.55) : null
  const gradientMid = validBrand ? hexToRgba(validBrand, 0.22) : null
  const gradientEnd = validBrand ? hexToRgba(validBrand, 0) : null
  const gradientStyle =
    gradientStart && gradientMid && gradientEnd
      ? {
          backgroundImage: `linear-gradient(90deg, ${gradientStart} 0%, ${gradientMid} 45%, ${gradientEnd} 100%)`,
        }
      : undefined

  return (
    <Card className="overflow-hidden rounded-3xl border border-muted/70 bg-background/90 shadow-sm">
      {gradientStyle ? <div className="h-3 rounded-t-3xl" style={gradientStyle} aria-hidden /> : null}
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="mt-1 h-10 w-1.5 rounded-full"
            style={accentStyle}
            aria-hidden
          />
          <div className="space-y-1">
            <CardTitle className="text-3xl font-semibold leading-tight">
              {clientName}
            </CardTitle>
            <CardDescription className="text-base">
              Campaign dashboard
            </CardDescription>
          </div>
        </div>

      </CardHeader>
    </Card>
  )
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  highlightStyle,
}: {
  label: string
  value: string
  helper: string
  icon: typeof Target
  highlightStyle?: React.CSSProperties
}) {
  return (
    <Card className="overflow-hidden rounded-3xl border-muted/70 bg-background/90 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      {highlightStyle ? <div className="h-2 w-full" style={highlightStyle} aria-hidden /> : null}
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold leading-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-muted/60 text-muted-foreground">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignListCard({
  campaign,
  clickable,
  href,
  statusLabel,
  accent,
}: {
  campaign: CampaignItem
  clickable?: boolean
  href?: string
  statusLabel?: string
  accent?: string
}) {
  const content = (
    <div
      className={`group rounded-2xl border border-muted/60 bg-background/90 p-4 shadow-sm ring-1 ring-black/[0.02] transition ${
        clickable ? 'hover:-translate-y-0.5 hover:shadow-md' : ''
      }`}
      style={
        accent
          ? {
              borderLeftColor: accent,
              borderLeftWidth: '6px',
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold leading-snug">
              {campaign.campaignName}
            </h4>
            {statusLabel ? (
              <Badge
                variant="outline"
                className="border-border/60 bg-background text-[11px] font-semibold"
              >
                {statusLabel}
              </Badge>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:text-sm">
            <div>
              <p className="font-medium text-foreground">Budget</p>
              <p>${campaign.budget.toLocaleString()}</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Dates</p>
              <p className="leading-tight">
                {campaign.startDate} – {campaign.endDate}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant="secondary" className="text-[11px] font-semibold">
            {campaign.mbaNumber}
          </Badge>
          {clickable ? (
            <span className="text-xs text-primary opacity-0 transition group-hover:opacity-100">
              View details →
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {campaign.mediaTypes.map((type, idx) => (
          <Badge
            key={`${campaign.mbaNumber}-${type}-${idx}`}
            variant="outline"
            className="rounded-full border-border/60 bg-background px-2 py-1 text-[11px] font-medium"
          >
            {type}
          </Badge>
        ))}
      </div>
    </div>
  )

  if (clickable && href) {
    return (
      <Link href={href} className="block focus:outline-none">
        {content}
      </Link>
    )
  }

  return <div>{content}</div>
}

function CampaignSection({
  title,
  badge,
  campaigns,
  accent,
  emptyTitle,
  emptySubtitle,
  getHref,
  statusLabel,
}: {
  title: string
  badge: React.ReactNode
  campaigns: CampaignItem[]
  accent?: string
  emptyTitle: string
  emptySubtitle: string
  getHref?: (campaign: CampaignItem) => string | null
  statusLabel?: (campaign: CampaignItem) => string
}) {
  const hasCampaigns = campaigns.length > 0

  return (
    <Card className="h-full rounded-3xl border-muted/70 bg-background/90 shadow-sm">
      <CardHeader className="border-b border-muted/40 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {badge}
          <span className="text-base font-semibold">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {hasCampaigns ? (
          <div className="relative max-h-[560px] space-y-4 overflow-y-auto pr-2">
            {campaigns.map((campaign) => {
              const href = getHref ? getHref(campaign) : null
              const clickable = Boolean(href)

              return (
                <CampaignListCard
                  key={`${campaign.mbaNumber}-${campaign.campaignName}`}
                  campaign={campaign}
                  href={href || undefined}
                  clickable={clickable}
                  accent={accent}
                  statusLabel={statusLabel?.(campaign)}
                />
              )
            })}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background via-background/60 to-transparent" />
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">{emptyTitle}</p>
            <p className="text-sm">{emptySubtitle}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyStateCard({ clientName }: { clientName: string }) {
  return (
    <Card className="rounded-2xl border border-border/50 bg-muted/30 shadow-sm">
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              No Campaigns Found
            </h3>
            <p className="text-sm text-muted-foreground">
              No campaigns have been found for {clientName}. This could mean:
            </p>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1 text-left">
            <li>• No campaigns have been created for this client yet</li>
            <li>• Campaigns exist but are not properly linked to this client</li>
            <li>• There may be a data synchronization issue</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function ClientDashboard({ params }: ClientDashboardProps) {
  const { slug } = await params
  const session = await auth0.getSession()
  const user = session?.user
  const role = getPrimaryRole(user)
  const userClientSlug = getUserClientIdentifier(user)

  if (!user) {
    redirect(`/auth/login?returnTo=/dashboard/${slug}`)
  }

  if (role === 'client' && userClientSlug && userClientSlug !== slug) {
    redirect(`/dashboard/${userClientSlug}`)
  }
  
  let clientData: ClientDashboardData | null = null
  let error: string | null = null
  
  try {
    clientData = await getClientDashboardData(slug)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error occurred'
    console.error('Dashboard error:', err)
  }

  // Handle errors (should not happen anymore since we return empty data instead of throwing)
  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-2xl">
          <h2 className="text-2xl font-bold text-red-900 mb-4">Dashboard Unavailable</h2>
          <p className="text-red-600 mb-4">
            An error occurred while loading the dashboard data.
          </p>
          <p className="text-sm text-gray-600">
            Please contact support if this issue persists.
          </p>
        </div>
      </div>
    )
  }

  if (!clientData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Client not found</h2>
          <p className="text-gray-600">The requested client dashboard could not be found.</p>
        </div>
      </div>
    )
  }

  // Check if client has any campaigns
  const hasCampaigns = clientData.liveCampaignsList.length > 0 || 
                      clientData.planningCampaignsList.length > 0 || 
                      clientData.completedCampaignsList.length > 0

  const kpiBrand =
    typeof clientData.brandColour === 'string' && hexToRgba(clientData.brandColour, 1)
      ? clientData.brandColour
      : undefined
  const kpiGradientStart = kpiBrand ? hexToRgba(kpiBrand, 0.55) : null
  const kpiGradientMid = kpiBrand ? hexToRgba(kpiBrand, 0.22) : null
  const kpiGradientEnd = kpiBrand ? hexToRgba(kpiBrand, 0) : null
  const kpiHighlightStyle =
    kpiGradientStart && kpiGradientMid && kpiGradientEnd
      ? {
          backgroundImage: `linear-gradient(90deg, ${kpiGradientStart} 0%, ${kpiGradientMid} 45%, ${kpiGradientEnd} 100%)`,
        }
      : undefined

  const campaignsForTotal = [
    ...clientData.liveCampaignsList,
    ...clientData.planningCampaignsList,
    ...clientData.completedCampaignsList,
  ]
  const totalCampaignsFallback = campaignsForTotal.filter((campaign) => {
    const status = (campaign.status ?? '').toLowerCase()
    return status === 'booked' || status === 'approved' || status === 'completed'
  }).length
  const totalCampaignsYTD =
    clientData.totalCampaignsYTD && clientData.totalCampaignsYTD > 0
      ? clientData.totalCampaignsYTD
      : totalCampaignsFallback

  return (
    <div className="w-full max-w-none space-y-8 bg-[#DEE5F4] px-4 pb-12 pt-8 md:px-6">
      <ClientDashboardHeader
        clientName={clientData.clientName}
        brandColour={clientData.brandColour}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Live Campaigns"
          value={clientData.liveCampaigns.toString()}
          helper="Currently active campaigns"
          icon={Target}
          highlightStyle={kpiHighlightStyle}
        />
        <KpiCard
          label="Total Campaigns YTD"
          value={totalCampaignsYTD.toString()}
          helper="Campaigns this year"
          icon={Calendar}
          highlightStyle={kpiHighlightStyle}
        />
        <KpiCard
          label="Spend Past 30 Days"
          value={`$${clientData.spendPast30Days.toLocaleString()}`}
          helper="Recent spending"
          icon={TrendingUp}
          highlightStyle={kpiHighlightStyle}
        />
        <KpiCard
          label="Total Spend"
          value={`$${clientData.totalSpend.toLocaleString()}`}
          helper="Current financial year"
          icon={DollarSign}
          highlightStyle={kpiHighlightStyle}
        />
      </div>

      {!hasCampaigns ? (
        <EmptyStateCard clientName={clientData.clientName} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <CampaignSection
            title="Live Campaigns"
            badge={
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                Live
              </Badge>
            }
            campaigns={clientData.liveCampaignsList}
            accent="#16a34a"
            emptyTitle="No live campaigns"
            emptySubtitle="All campaigns are either in planning or completed"
            statusLabel={(campaign) => campaign.status ?? 'Live'}
            getHref={(campaign) =>
              campaign.status === 'booked' || campaign.status === 'approved'
                ? `/dashboard/${slug}/${campaign.mbaNumber}`
                : null
            }
          />

          <CampaignSection
            title="Campaign Planning"
            badge={
              <Badge variant="secondary" className="bg-muted text-foreground">
                Planning
              </Badge>
            }
            campaigns={clientData.planningCampaignsList}
            emptyTitle="No campaigns in planning phase"
            emptySubtitle="All campaigns are either live or completed"
            statusLabel={(campaign) => campaign.status ?? 'Planning'}
          />

          <CampaignSection
            title="Completed"
            badge={
              <Badge variant="outline" className="border-border/60">
                Completed
              </Badge>
            }
            campaigns={clientData.completedCampaignsList}
            accent="#64748b"
            emptyTitle="No completed campaigns"
            emptySubtitle="All campaigns are either live or in planning"
            statusLabel={(campaign) => campaign.status ?? 'Completed'}
            getHref={(campaign) => `/dashboard/${slug}/${campaign.mbaNumber}`}
          />
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-muted/70 bg-background/90 px-6 py-4 shadow-sm">
          <h2 className="text-xl font-semibold">Analytics</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense
            fallback={
              <Card className="rounded-3xl border border-muted/70 bg-background/90 shadow-sm">
                <CardHeader className="border-b border-muted/40 px-6 py-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <Skeleton className="h-[512px] w-full rounded-2xl" />
                </CardContent>
              </Card>
            }
          >
            <SpendByMediaTypeChart slug={slug} brandColour={clientData.brandColour} />
          </Suspense>

          <Suspense
            fallback={
              <Card className="rounded-3xl border border-muted/70 bg-background/90 shadow-sm">
                <CardHeader className="border-b border-muted/40 px-6 py-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <Skeleton className="h-[512px] w-full rounded-2xl" />
                </CardContent>
              </Card>
            }
          >
            <SpendByCampaignChart slug={slug} brandColour={clientData.brandColour} />
          </Suspense>
        </div>

        <Suspense
          fallback={
            <Card className="rounded-3xl border border-muted/70 bg-background/90 shadow-sm">
              <CardHeader className="border-b border-muted/40 px-6 py-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-72" />
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <Skeleton className="h-[320px] w-full rounded-2xl" />
              </CardContent>
            </Card>
          }
        >
          <MonthlySpendChart slug={slug} brandColour={clientData.brandColour} />
        </Suspense>
      </div>
    </div>
  )
}
