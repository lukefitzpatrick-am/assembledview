import { Card, CardContent } from '@/components/ui/card'
import { format } from 'date-fns'

interface CampaignHeaderProps {
  campaign: any
}

export default function CampaignHeader({ campaign }: CampaignHeaderProps) {
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return format(date, 'dd/MM/yyyy')
    } catch {
      return dateString
    }
  }

  const formatCurrency = (value: string | number | undefined) => {
    if (!value) return '$0.00'
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]+/g, '')) : value
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(num || 0)
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Client</p>
            <p className="text-base font-semibold">{campaign.mp_client_name || campaign.client_name || 'N/A'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Brand</p>
            <p className="text-base font-semibold">{campaign.mp_brand || campaign.brand || 'N/A'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Campaign</p>
            <p className="text-base font-semibold">{campaign.campaign_name || campaign.mp_campaignname || 'N/A'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">MBA Number</p>
            <p className="text-base font-semibold">{campaign.mbaNumber || campaign.mba_number || 'N/A'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Client Contact</p>
            <p className="text-base font-semibold">{campaign.mp_clientcontact || campaign.client_contact || 'N/A'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Plan Version</p>
            <p className="text-base font-semibold">v{campaign.versionNumber || campaign.version_number || '1'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Plan Date</p>
            <p className="text-base font-semibold">{format(new Date(), 'dd/MM/yyyy')}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">PO Number</p>
            <p className="text-base font-semibold">{campaign.mp_ponumber || campaign.po_number || 'N/A'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Campaign Budget</p>
            <p className="text-base font-semibold">{formatCurrency(campaign.mp_campaignbudget || campaign.campaign_budget)}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Campaign Status</p>
            <p className="text-base font-semibold">{campaign.campaign_status || campaign.mp_campaignstatus || 'N/A'}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Campaign Start Date</p>
            <p className="text-base font-semibold">{formatDate(campaign.campaign_start_date || campaign.mp_campaigndates_start)}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Campaign End Date</p>
            <p className="text-base font-semibold">{formatDate(campaign.campaign_end_date || campaign.mp_campaigndates_end)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}



































































