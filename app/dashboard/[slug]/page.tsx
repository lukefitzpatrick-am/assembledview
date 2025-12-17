import { Suspense } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, TrendingUp, Calendar, DollarSign, Target } from 'lucide-react'
import { ClientDashboardData } from '@/lib/types/dashboard'
import { getClientDashboardData } from '@/lib/api/dashboard'
import { getGradientStyle } from '@/lib/utils/colors'
import SpendByMediaTypeChart from './components/SpendByMediaTypeChart'
import SpendByCampaignChart from './components/SpendByCampaignChart'
import MonthlySpendChart from './components/MonthlySpendChart'

interface ClientDashboardProps {
  params: {
    slug: string
  }
}

export default async function ClientDashboard({ params }: ClientDashboardProps) {
  const { slug } = await params
  
  let clientData: ClientDashboardData | null = null
  let error: string | null = null
  
  try {
    clientData = await getClientDashboardData(slug)
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error occurred'
    console.error('Dashboard error:', err)
  }

  // Debug logging
  console.log('Client dashboard data:', {
    clientName: clientData?.clientName,
    spendByMediaType: clientData?.spendByMediaType,
    spendByCampaign: clientData?.spendByCampaign,
    monthlySpend: clientData?.monthlySpend
  })

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

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div 
        className="rounded-lg p-8 text-white"
        style={getGradientStyle(clientData.brandColour)}
      >
        <h1 className="text-3xl font-bold mb-2">Welcome to {clientData.clientName}</h1>
        <p className="text-white/90">Your comprehensive campaign dashboard</p>
      </div>

      {/* Data Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Live Campaigns</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientData.liveCampaigns}</div>
            <p className="text-xs text-muted-foreground">
              Currently active campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns YTD</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientData.totalCampaignsYTD}</div>
            <p className="text-xs text-muted-foreground">
              Campaigns this year
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spend Past 30 Days</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${clientData.spendPast30Days.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Recent spending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spent YTD</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${clientData.spentYTD.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Year to date spending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Tables */}
      {!hasCampaigns ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">No Campaigns Found</h3>
            <p className="text-yellow-700">
              No campaigns have been found for {clientData.clientName}. This could mean:
            </p>
            <ul className="text-sm text-yellow-600 mt-2 space-y-1">
              <li>• No campaigns have been created for this client yet</li>
              <li>• Campaigns exist but are not properly linked to this client</li>
              <li>• There may be a data synchronization issue</li>
            </ul>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-500">Live</Badge>
              Live Campaigns
            </CardTitle>
            <CardDescription>Currently active campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            {clientData.liveCampaignsList.length > 0 ? (
              <div className="max-h-[400px] overflow-y-auto scroll-smooth space-y-4 pr-2">
                {clientData.liveCampaignsList.map((campaign, index) => {
                  const isClickable = campaign.status === 'booked' || campaign.status === 'approved'
                  const CampaignCard = (
                    <div className={`border rounded-lg p-4 ${isClickable ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold">{campaign.campaignName}</h4>
                        <Badge variant="outline">{campaign.mbaNumber}</Badge>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Budget: ${campaign.budget.toLocaleString()}</p>
                        <p>Period: {campaign.startDate} - {campaign.endDate}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {campaign.mediaTypes.map((type, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {type}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                  
                  return isClickable ? (
                    <Link key={index} href={`/dashboard/${slug}/${campaign.mbaNumber}`}>
                      {CampaignCard}
                    </Link>
                  ) : (
                    <div key={index}>{CampaignCard}</div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No live campaigns</p>
                <p className="text-sm">All campaigns are either in planning or completed</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campaign Planning */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="secondary">Planning</Badge>
              Campaign Planning
            </CardTitle>
            <CardDescription>Upcoming campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            {clientData.planningCampaignsList.length > 0 ? (
              <div className="max-h-[400px] overflow-y-auto scroll-smooth space-y-4 pr-2">
                {clientData.planningCampaignsList.map((campaign, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold">{campaign.campaignName}</h4>
                      <Badge variant="outline">{campaign.mbaNumber}</Badge>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Budget: ${campaign.budget.toLocaleString()}</p>
                      <p>Period: {campaign.startDate} - {campaign.endDate}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {campaign.mediaTypes.map((type, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No campaigns in planning phase</p>
                <p className="text-sm">All campaigns are either live or completed</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline">Completed</Badge>
              Completed
            </CardTitle>
            <CardDescription>Finished campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            {clientData.completedCampaignsList.length > 0 ? (
              <div className="max-h-[400px] overflow-y-auto scroll-smooth space-y-4 pr-2">
                {clientData.completedCampaignsList.map((campaign, index) => {
                  const CampaignCard = (
                    <div className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold">{campaign.campaignName}</h4>
                        <Badge variant="outline">{campaign.mbaNumber}</Badge>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Budget: ${campaign.budget.toLocaleString()}</p>
                        <p>Period: {campaign.startDate} - {campaign.endDate}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {campaign.mediaTypes.map((type, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {type}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                  
                  return (
                    <Link key={index} href={`/dashboard/${slug}/${campaign.mbaNumber}`}>
                      {CampaignCard}
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No completed campaigns</p>
                <p className="text-sm">All campaigns are either live or in planning</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Analytics Section */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Analytics</h2>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export All Data
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Spend by Media Type Chart */}
          <Suspense fallback={
            <Card>
              <CardHeader>
                <CardTitle>Spend by Media Type</CardTitle>
                <CardDescription>Loading...</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80 flex items-center justify-center">
                  <div className="text-muted-foreground">Loading chart data...</div>
                </div>
              </CardContent>
            </Card>
          }>
            <SpendByMediaTypeChart slug={slug} />
          </Suspense>

          {/* Spend by Campaign Chart */}
          <Suspense fallback={
            <Card>
              <CardHeader>
                <CardTitle>Spend by Campaign</CardTitle>
                <CardDescription>Loading...</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80 flex items-center justify-center">
                  <div className="text-muted-foreground">Loading chart data...</div>
                </div>
              </CardContent>
            </Card>
          }>
            <SpendByCampaignChart slug={slug} />
          </Suspense>
        </div>

        {/* Monthly Spend Chart */}
        <Suspense fallback={
          <Card>
            <CardHeader>
              <CardTitle>Spend by Media Type by Month</CardTitle>
              <CardDescription>Loading...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80 flex items-center justify-center">
                <div className="text-muted-foreground">Loading chart data...</div>
              </div>
            </CardContent>
          </Card>
        }>
          <MonthlySpendChart slug={slug} />
        </Suspense>
      </div>
    </div>
  )
}
