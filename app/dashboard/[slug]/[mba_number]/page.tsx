import { Suspense } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import CampaignTimeChart from './components/CampaignTimeChart'
import CampaignSpendChart from './components/CampaignSpendChart'
import MediaChannelPieChart from './components/MediaChannelPieChart'
import MonthlySpendStackedChart from './components/MonthlySpendStackedChart'
import MediaTable from './components/MediaTable'
import MediaGanttChart from './components/MediaGanttChart'
import CampaignHeader from './components/CampaignHeader'
import CampaignActions from './components/CampaignActions'
import { auth0 } from '@/lib/auth0'
import { getPrimaryRole, getUserClientIdentifier } from '@/lib/rbac'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

interface CampaignDetailPageProps {
  params: {
    slug: string
    mba_number: string
  }
}

async function fetchCampaignData(mbaNumber: string) {
  const headerList = headers()
  const host = headerList.get('x-forwarded-host') || headerList.get('host')
  const protocol = headerList.get('x-forwarded-proto') || 'https'
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '')
  const runtimeBase = host ? `${protocol}://${host}` : ''
  const baseUrl = envBase || runtimeBase
  const url = `${baseUrl}/api/campaigns/${encodeURIComponent(mbaNumber)}`

  try {
    const response = await fetch(url, { 
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to fetch campaign data: ${response.statusText}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching campaign data:', error)
    throw error
  }
}

export default async function CampaignDetailPage({ params }: CampaignDetailPageProps) {
  const { slug, mba_number } = params
  const session = await auth0.getSession()
  const user = session?.user
  const role = getPrimaryRole(user)
  const userClientSlug = getUserClientIdentifier(user)

  if (!user) {
    redirect(`/auth/login?returnTo=/dashboard/${slug}/${mba_number}`)
  }

  if (role === 'client' && userClientSlug && userClientSlug !== slug) {
    redirect(`/dashboard/${userClientSlug}`)
  }
  
  let campaignData: any = null
  let error: string | null = null
  
  try {
    campaignData = await fetchCampaignData(mba_number)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error occurred'
    console.error('Campaign detail page error:', err)
  }

  if (error || !campaignData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-2xl">
          <h2 className="text-2xl font-bold text-red-900 mb-4">Campaign Not Found</h2>
          <p className="text-red-600 mb-4">
            {error || 'The requested campaign could not be found.'}
          </p>
          <p className="text-sm text-gray-600">
            Please check the MBA number and try again.
          </p>
        </div>
      </div>
    )
  }

  const campaign = campaignData.campaign
  const lineItems = campaignData.lineItems || {}
  const metrics = campaignData.metrics || {}
  const billingSchedule = campaignData.billingSchedule

  return (
    <div className="w-full px-4 lg:px-8 space-y-8 pb-32">
      {/* Campaign Header Section */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <CampaignHeader campaign={campaign} />
      </Suspense>

      {/* Metrics Section - Time Elapsed and Spend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Campaign Time Elapsed</CardTitle>
            <CardDescription>Progress through campaign timeline</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <CampaignTimeChart 
                timeElapsed={metrics.timeElapsed || 0}
                daysInCampaign={metrics.daysInCampaign}
                daysElapsed={metrics.daysElapsed}
                daysRemaining={metrics.daysRemaining}
              />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Spend to Date</CardTitle>
            <CardDescription>Expected vs actual spend</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <CampaignSpendChart 
                expectedSpend={metrics.expectedSpendToDate || 0}
                campaignBudget={parseFloat(campaign.mp_campaignbudget || 0)}
              />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Spend by Media Channel</CardTitle>
            <CardDescription>Distribution of spend across media types</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-80 w-full" />}>
              <MediaChannelPieChart data={metrics.spendByMediaChannel || []} />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Spend by Channel</CardTitle>
            <CardDescription>Spend breakdown by month</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-80 w-full" />}>
              <MonthlySpendStackedChart data={metrics.monthlySpend || []} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Media Table Section */}
      <Card>
        <CardHeader>
          <CardTitle>Media Line Items</CardTitle>
          <CardDescription>Detailed breakdown of all media placements</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <MediaTable lineItems={lineItems} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Gantt Chart Section */}
      <Card>
        <CardHeader>
          <CardTitle>Media Timeline</CardTitle>
          <CardDescription>When media is live by day</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <MediaGanttChart 
              lineItems={lineItems}
              startDate={campaign.campaign_start_date || campaign.mp_campaigndates_start}
              endDate={campaign.campaign_end_date || campaign.mp_campaigndates_end}
            />
          </Suspense>
        </CardContent>
      </Card>

      {/* Sticky Footer with Download Buttons */}
      <CampaignActions 
        mbaNumber={mba_number}
        campaign={campaign}
        lineItems={lineItems}
        billingSchedule={billingSchedule}
      />
    </div>
  )
}
