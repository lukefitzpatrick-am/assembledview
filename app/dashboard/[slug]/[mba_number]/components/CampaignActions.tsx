"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, FileText } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'

interface CampaignActionsProps {
  mbaNumber: string
  campaign: any
  lineItems: Record<string, any[]>
  billingSchedule: any
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => binary += String.fromCharCode(b))
  return window.btoa(binary)
}

export default function CampaignActions({ mbaNumber, campaign, lineItems, billingSchedule }: CampaignActionsProps) {
  const [isDownloadingMediaPlan, setIsDownloadingMediaPlan] = useState(false)
  const [isDownloadingBillingSchedule, setIsDownloadingBillingSchedule] = useState(false)

  const handleDownloadMediaPlan = async () => {
    setIsDownloadingMediaPlan(true)
    try {
      // Fetch and encode logo
      const logoBuf = await fetch('/assembled-logo.png').then(r => r.arrayBuffer())
      const logoBase64 = bufferToBase64(logoBuf)

      // Transform line items to match expected format
      const transformLineItems = (items: any[]) => {
        return items.map(item => ({
          market: item.market || '',
          platform: item.platform || '',
          network: item.network || '',
          station: item.station || '',
          bidStrategy: item.bidStrategy || item.bid_strategy || '',
          targeting: item.targeting || '',
          creative: item.creative || '',
          startDate: item.start_date || item.startDate || item.placement_date || '',
          endDate: item.end_date || item.endDate || item.placement_date || '',
          deliverables: item.deliverables || item.timps || item.tarps || item.spots || item.insertions || item.panels || item.screens || item.clicks || item.impressions || 0,
          buyingDemo: item.buyingDemo || item.buying_demo || '',
          buyType: item.buyType || item.buy_type || '',
          deliverablesAmount: item.deliverablesAmount || item.budget || item.spend || item.cost || item.investment || '0',
          grossMedia: item.grossMedia || item.budget || item.spend || item.cost || item.investment || '0',
          daypart: item.daypart || '',
          placement: item.placement || '',
          size: item.size || '',
          format: item.format || '',
          duration: item.duration || '',
          oohFormat: item.oohFormat || item.ooh_format || '',
          oohType: item.oohType || item.ooh_type || '',
          panels: item.panels || '',
          cinemaTarget: item.cinemaTarget || item.cinema_target || '',
          screens: item.screens || '',
          title: item.title || '',
          insertions: item.insertions || '',
          radioDuration: item.radioDuration || item.radio_duration || '',
          spots: item.spots || '',
          site: item.site || '',
          digitalDuration: item.digitalDuration || item.digital_duration || '',
        }))
      }

      // Build header payload
      const header = {
        logoBase64,
        logoWidth: 457,
        logoHeight: 71,
        client: campaign.mp_client_name || campaign.client_name || '',
        brand: campaign.mp_brand || campaign.brand || '',
        campaignName: campaign.campaign_name || campaign.mp_campaignname || '',
        mbaNumber: mbaNumber,
        clientContact: campaign.mp_clientcontact || campaign.client_contact || '',
        planVersion: campaign.versionNumber || campaign.version_number || '1',
        poNumber: campaign.mp_ponumber || campaign.po_number || '',
        campaignBudget: new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
          parseFloat(campaign.mp_campaignbudget || campaign.campaign_budget || '0')
        ),
        campaignStatus: campaign.campaign_status || campaign.mp_campaignstatus || '',
        campaignStart: campaign.campaign_start_date || campaign.mp_campaigndates_start
          ? format(new Date(campaign.campaign_start_date || campaign.mp_campaigndates_start), 'dd/MM/yyyy')
          : '',
        campaignEnd: campaign.campaign_end_date || campaign.mp_campaigndates_end
          ? format(new Date(campaign.campaign_end_date || campaign.mp_campaigndates_end), 'dd/MM/yyyy')
          : '',
      }

      // Build media items object
      const mediaItems = {
        search: transformLineItems(lineItems.search || []),
        socialMedia: transformLineItems(lineItems.socialMedia || []),
        digiAudio: transformLineItems(lineItems.digitalAudio || []),
        digiDisplay: transformLineItems(lineItems.digitalDisplay || []),
        digiVideo: transformLineItems(lineItems.digitalVideo || []),
        bvod: transformLineItems(lineItems.bvod || []),
        progDisplay: transformLineItems(lineItems.progDisplay || []),
        progVideo: transformLineItems(lineItems.progVideo || []),
        progBvod: transformLineItems(lineItems.progBvod || []),
        progOoh: transformLineItems(lineItems.progOoh || []),
        progAudio: transformLineItems(lineItems.progAudio || []),
        newspaper: transformLineItems(lineItems.newspaper || []),
        magazines: transformLineItems(lineItems.magazines || []),
        television: transformLineItems(lineItems.television || []),
        radio: transformLineItems(lineItems.radio || []),
        ooh: transformLineItems(lineItems.ooh || []),
        cinema: transformLineItems(lineItems.cinema || []),
        integration: transformLineItems(lineItems.integration || []),
      }

      // Call the download API
      const response = await fetch('/api/mediaplans/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...header,
          ...mediaItems,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate media plan')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `media-plan-${mbaNumber}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Success',
        description: 'Media plan downloaded successfully',
      })
    } catch (error) {
      console.error('Error downloading media plan:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download media plan',
        variant: 'destructive',
      })
    } finally {
      setIsDownloadingMediaPlan(false)
    }
  }

  const handleDownloadBillingSchedule = async () => {
    setIsDownloadingBillingSchedule(true)
    try {
      if (!billingSchedule || !Array.isArray(billingSchedule) || billingSchedule.length === 0) {
        throw new Error('No billing schedule data available for this campaign')
      }

      const response = await fetch(`/api/campaigns/${encodeURIComponent(mbaNumber)}/billing-schedule`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate billing schedule')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `billing-schedule-${mbaNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Success',
        description: 'Billing schedule downloaded successfully',
      })
    } catch (error) {
      console.error('Error downloading billing schedule:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download billing schedule',
        variant: 'destructive',
      })
    } finally {
      setIsDownloadingBillingSchedule(false)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t z-50 shadow-lg">
      <div className="mx-auto flex w-full items-center justify-end gap-4 px-4 py-4 lg:px-6">
        <div className="flex space-x-2">
          <Button
            onClick={handleDownloadMediaPlan}
            disabled={isDownloadingMediaPlan}
            className="bg-[#B5D337] text-white hover:bg-[#B5D337]/90"
          >
            {isDownloadingMediaPlan ? (
              <>
                <Download className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Media Plan
              </>
            )}
          </Button>
          <Button
            onClick={handleDownloadBillingSchedule}
            disabled={isDownloadingBillingSchedule || !billingSchedule || !Array.isArray(billingSchedule) || billingSchedule.length === 0}
            className="bg-[#472477] text-white hover:bg-[#472477]/90"
          >
            {isDownloadingBillingSchedule ? (
              <>
                <FileText className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Download Billing Schedule
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}



































































