'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { LoadingDots } from '@/components/ui/loading-dots'
import CampaignTimeChart from './CampaignTimeChart'
import CampaignSpendChart from './CampaignSpendChart'
import MediaChannelPieChart from './MediaChannelPieChart'
import MonthlySpendStackedChart from './MonthlySpendStackedChart'
import MediaTable from './MediaTable'
import MediaGanttChart from './MediaGanttChart'
import { format } from 'date-fns'

interface CampaignDetailContentProps {
  slug: string
  mbaNumber: string
}

interface CampaignData {
  campaign: {
    clientName: string
    campaignName: string
    brand: string
    mbaNumber: string
    clientContact: string
    planVersion: string
    planDate: string
    poNumber: string
    campaignBudget: number
    campaignStatus: string
    campaignStartDate: string
    campaignEndDate: string
  }
  lineItems: Record<string, any[]>
  billingSchedule: any
  metrics: {
    timeElapsedPercent: number
    expectedSpendToDate: number
    actualSpendToDate: number
    totalExpectedSpend: number
    spendByChannel: Record<string, number>
    monthlySpend: Record<string, Record<string, number>>
  }
}

export default function CampaignDetailContent({ slug, mbaNumber }: CampaignDetailContentProps) {
  const [data, setData] = useState<CampaignData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingMediaPlan, setDownloadingMediaPlan] = useState(false)
  const [downloadingBilling, setDownloadingBilling] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(`/api/campaigns/${mbaNumber}`)
        if (!response.ok) {
          throw new Error('Failed to fetch campaign data')
        }
        const campaignData = await response.json()
        setData(campaignData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [mbaNumber])

  const handleDownloadMediaPlan = async () => {
    if (!data) return
    
    setDownloadingMediaPlan(true)
    try {
      // Fetch logo
      const logoBuf = await fetch('/assembled-logo.png').then(r => r.arrayBuffer())
      const logoBase64 = bufferToBase64(logoBuf)

      // Prepare media items from line items
      const mediaItems = {
        search: data.lineItems.search || [],
        socialMedia: data.lineItems.socialMedia || [],
        digiAudio: data.lineItems.digitalAudio || [],
        digiDisplay: data.lineItems.digitalDisplay || [],
        digiVideo: data.lineItems.digitalVideo || [],
        bvod: data.lineItems.bvod || [],
        progDisplay: data.lineItems.progDisplay || [],
        progVideo: data.lineItems.progVideo || [],
        progBvod: data.lineItems.progBvod || [],
        progOoh: data.lineItems.progOoh || [],
        progAudio: data.lineItems.progAudio || [],
        newspaper: data.lineItems.newspaper || [],
        magazines: data.lineItems.magazines || [],
        television: data.lineItems.television || [],
        radio: data.lineItems.radio || [],
        ooh: data.lineItems.ooh || [],
        cinema: data.lineItems.cinema || [],
        integration: data.lineItems.integration || [],
      }

      const response = await fetch('/api/mediaplans/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          logoBase64,
          logoWidth: 457,
          logoHeight: 71,
          mp_clientname: data.campaign.clientName,
          mp_brand: data.campaign.brand,
          mp_campaignname: data.campaign.campaignName,
          mbanumber: data.campaign.mbaNumber,
          mp_clientcontact: data.campaign.clientContact,
          version_number: data.campaign.planVersion,
          mp_ponumber: data.campaign.poNumber,
          mp_campaignbudget: data.campaign.campaignBudget.toString(),
          mp_campaignstatus: data.campaign.campaignStatus,
          mp_campaigndates_start: data.campaign.campaignStartDate,
          mp_campaigndates_end: data.campaign.campaignEndDate,
          ...mediaItems,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to download media plan')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `media-plan-${data.campaign.mbaNumber}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error downloading media plan:', err)
      alert('Failed to download media plan')
    } finally {
      setDownloadingMediaPlan(false)
    }
  }

  const handleDownloadBillingSchedule = async () => {
    if (!data) return
    
    setDownloadingBilling(true)
    try {
      const response = await fetch(`/api/campaigns/${mbaNumber}/billing-schedule`)
      if (!response.ok) {
        throw new Error('Failed to download billing schedule')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `billing-schedule-${data.campaign.mbaNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error downloading billing schedule:', err)
      alert('Failed to download billing schedule')
    } finally {
      setDownloadingBilling(false)
    }
  }

  function bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="mx-auto mb-4">
            <LoadingDots size="lg" />
          </div>
          <p className="text-muted-foreground">Loading campaign details...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-900 mb-4">Error Loading Campaign</h2>
          <p className="text-red-600 mb-4">{error || 'Campaign not found'}</p>
        </div>
      </div>
    )
  }

  const getStatusBadgeVariant = (status: string) => {
    const lowerStatus = status.toLowerCase()
    if (lowerStatus === 'booked' || lowerStatus === 'approved') return 'default'
    if (lowerStatus === 'completed') return 'secondary'
    return 'outline'
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Campaign Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl mb-2">{data.campaign.campaignName}</CardTitle>
              <CardDescription className="text-base">
                {data.campaign.clientName} • {data.campaign.brand}
              </CardDescription>
            </div>
            <Badge variant={getStatusBadgeVariant(data.campaign.campaignStatus)} className="text-lg px-4 py-2">
              {data.campaign.campaignStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Client</p>
              <p className="text-base">{data.campaign.clientName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Brand</p>
              <p className="text-base">{data.campaign.brand || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Campaign</p>
              <p className="text-base">{data.campaign.campaignName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">MBA Number</p>
              <p className="text-base">{data.campaign.mbaNumber}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Client Contact</p>
              <p className="text-base">{data.campaign.clientContact || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Plan Version</p>
              <p className="text-base">{data.campaign.planVersion}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Plan Date</p>
              <p className="text-base">{data.campaign.planDate}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">PO Number</p>
              <p className="text-base">{data.campaign.poNumber || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Campaign Budget</p>
              <p className="text-base">
                {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(data.campaign.campaignBudget)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Campaign Status</p>
              <p className="text-base">{data.campaign.campaignStatus}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Campaign Start Date</p>
              <p className="text-base">
                {format(new Date(data.campaign.campaignStartDate), 'dd/MM/yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Campaign End Date</p>
              <p className="text-base">
                {format(new Date(data.campaign.campaignEndDate), 'dd/MM/yyyy')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time and Spend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CampaignTimeChart timeElapsedPercent={data.metrics.timeElapsedPercent} />
        <CampaignSpendChart 
          expectedSpend={data.metrics.expectedSpendToDate}
          actualSpend={data.metrics.actualSpendToDate}
          totalExpected={data.metrics.totalExpectedSpend}
        />
      </div>

      {/* Media Channel Pie Chart */}
      <MediaChannelPieChart spendByChannel={data.metrics.spendByChannel} />

      {/* Monthly Spend Stacked Chart */}
      <MonthlySpendStackedChart monthlySpend={data.metrics.monthlySpend} />

      {/* Media Table */}
      <MediaTable lineItems={data.lineItems} />

      {/* Gantt Chart */}
      <MediaGanttChart 
        lineItems={data.lineItems}
        campaignStartDate={data.campaign.campaignStartDate}
        campaignEndDate={data.campaign.campaignEndDate}
      />

      {/* Sticky Footer with Download Buttons */}
      <div className="fixed bottom-0 left-[240px] right-0 bg-background/95 backdrop-blur-sm border-t p-4 flex justify-end items-center z-50 gap-4">
        <Button
          onClick={handleDownloadMediaPlan}
          disabled={downloadingMediaPlan}
          className="bg-[#B5D337] text-white hover:bg-[#B5D337]/90"
        >
          {downloadingMediaPlan ? 'Downloading...' : 'Download Media Plan'}
          <Download className="h-4 w-4 ml-2" />
        </Button>
        <Button
          onClick={handleDownloadBillingSchedule}
          disabled={downloadingBilling}
          className="bg-[#472477] text-white hover:bg-[#472477]/90"
        >
          {downloadingBilling ? 'Downloading...' : 'Download Billing Schedule'}
          <Download className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

