import { ClientDashboardData, Campaign, Client } from '@/lib/types/dashboard'
import { 
  aggregateMonthlySpendByMediaType, 
  getSpendByMediaTypeFromLineItems, 
  getSpendByCampaignFromLineItems 
} from './media-containers'
import axios from 'axios'

const XANO_CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const XANO_MEDIAPLANS_BASE_URL = process.env.XANO_MEDIAPLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"
const MEDIA_PLAN_MASTER_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
const MEDIA_PLANS_VERSIONS_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"

// Create axios instance with timeout
const apiClient = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
})

// Helper function to normalize client names for consistent comparison
function normalizeClientName(name: string): string {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Helper function to check if two client names match
function clientNamesMatch(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false
  return normalizeClientName(name1) === normalizeClientName(name2)
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  try {
    // Fetch all clients from Xano
    const response = await apiClient.get(`${XANO_CLIENTS_BASE_URL}/clients`)
    const clients = response.data
    
    // Debug logging
    console.log('Looking for slug:', slug)
    
    // Find client by converting name to slug
    const client = clients.find((c: any) => {
      const clientSlug = c.mp_client_name
        ?.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim()
      return clientSlug === slug
    })
    
    if (!client) {
      console.log('Client not found for slug:', slug)
      return null
    }
    
    return {
      id: client.id.toString(),
      name: client.mp_client_name,
      slug: slug,
      createdAt: client.created_at || new Date().toISOString(),
      updatedAt: client.updated_at || new Date().toISOString(),
      brandColour: client.brand_colour
    }
  } catch (error) {
    console.error('Error fetching client by slug:', error)
    return null
  }
}

export async function getClientDashboardData(slug: string): Promise<ClientDashboardData | null> {
  // SECURITY: Validate input parameters
  if (!slug || typeof slug !== 'string' || slug.trim().length === 0) {
    console.error('SECURITY: Invalid slug parameter provided:', slug)
    return null
  }
  
  // Sanitize slug input
  const sanitizedSlug = slug.trim()
  
  const client = await getClientBySlug(sanitizedSlug)
  if (!client) {
    console.error('SECURITY: Client not found for slug:', sanitizedSlug)
    return null
  }
  
  // Validate client object has required fields
  if (!client.name || typeof client.name !== 'string' || client.name.trim().length === 0) {
    console.error('SECURITY: Client object missing or invalid name field:', client)
    return null
  }

  // SECURITY NOTE: This function ensures that only data for the specific client is returned
  // Multiple safety checks are in place to prevent data leakage between clients
  // 
  // FIXED SECURITY VULNERABILITY (2024):
  // - Added comprehensive API filtering validation
  // - Implemented multiple fallback query methods for Xano API
  // - Added immediate security checks after client-side filtering
  // - Enhanced logging to identify filtering failures
  // - Added strict type validation for mp_client_name field
  // - Implemented fail-fast approach to prevent data leakage

  try {
    // Fetch media plan master data for this client
    let masterData = []
    let versionsData = []
    
    try {
      // Use standardized mp_client_name field
      const masterResponse = await apiClient.get(`${MEDIA_PLAN_MASTER_URL}/media_plan_master?mp_client_name=${encodeURIComponent(client.name)}`)
      masterData = masterResponse.data || []
      console.log('Master API response for client:', client.name, {
        url: `${MEDIA_PLAN_MASTER_URL}/media_plan_master?mp_client_name=${encodeURIComponent(client.name)}`,
        responseLength: masterData.length,
        sampleData: masterData[0]
      })
    } catch (error) {
      console.log('Master data fetch failed:', error)
    }

    try {
      // Try alternative API query approaches
      console.log('Attempting API filtering for client:', client.name)
      
      // Method 1: Try with URLSearchParams (like other endpoints)
      const params = new URLSearchParams()
      params.append('mp_client_name', client.name)
      const versionsUrl1 = `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?${params.toString()}`
      
      try {
        const versionsResponse1 = await apiClient.get(versionsUrl1)
        versionsData = versionsResponse1.data || []
        console.log('Method 1 (URLSearchParams) response:', {
          url: versionsUrl1,
          responseLength: versionsData.length,
          sampleData: versionsData[0]
        })
        
        if (versionsData.length > 0) {
          console.log('SUCCESS: API filtering worked with URLSearchParams')
          console.log('Method 1 returned data for client(s):', [...new Set(versionsData.map((v: any) => v.mp_client_name))])
        }
      } catch (error1) {
        console.log('Method 1 failed:', error1.message)
        
        // Method 2: Try different parameter name
        try {
          const versionsUrl2 = `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?client_name=${encodeURIComponent(client.name)}`
          const versionsResponse2 = await apiClient.get(versionsUrl2)
          versionsData = versionsResponse2.data || []
          console.log('Method 2 (client_name) response:', {
            url: versionsUrl2,
            responseLength: versionsData.length,
            sampleData: versionsData[0]
          })
          
          if (versionsData.length > 0) {
            console.log('SUCCESS: API filtering worked with client_name parameter')
            console.log('Method 2 returned data for client(s):', [...new Set(versionsData.map((v: any) => v.mp_client_name))])
          }
        } catch (error2) {
          console.log('Method 2 failed:', error2.message)
          
          // Method 3: Try original approach
          try {
            const versionsUrl3 = `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?mp_client_name=${encodeURIComponent(client.name)}`
            const versionsResponse3 = await apiClient.get(versionsUrl3)
            versionsData = versionsResponse3.data || []
            console.log('Method 3 (original) response:', {
              url: versionsUrl3,
              responseLength: versionsData.length,
              sampleData: versionsData[0]
            })
            
            if (versionsData.length > 0) {
              console.log('Method 3 returned data for client(s):', [...new Set(versionsData.map((v: any) => v.mp_client_name))])
            }
          } catch (error3) {
            console.log('Method 3 failed:', error3.message)
            versionsData = []
          }
        }
      }
    } catch (error) {
      console.log('All API filtering methods failed:', error)
      versionsData = []
    }

    // Debug logging to see what we're getting from the API
    console.log('API Debug for client:', client.name, {
      masterDataLength: masterData.length,
      versionsDataLength: versionsData.length
    })

    // SECURITY: Validate API filtering results
    if (versionsData.length > 0) {
      const apiClientNames = [...new Set(versionsData.map((version: any) => 
        version.mp_client_name
      ))].filter(Boolean)
      
      console.log('API filtering validation:', {
        returnedClientNames: apiClientNames,
        expectedClient: client.name,
        isFilteringWorking: apiClientNames.length === 1 && clientNamesMatch(apiClientNames[0], client.name)
      })
      
      // If API filtering returned multiple clients, it's broken - force fallback
      if (apiClientNames.length > 1 || (apiClientNames.length === 1 && !clientNamesMatch(apiClientNames[0], client.name))) {
        console.warn('API filtering did not return correct client data - using client-side filtering fallback')
        console.warn('Expected client:', client.name)
        console.warn('Returned client(s):', apiClientNames)
        console.warn('This is expected behavior - client-side filtering will ensure data security')
        versionsData = [] // Force fallback to client-side filtering
      }
    }

    // SECURITY FIX: If no data returned from API, try alternative approach
    if (versionsData.length === 0) {
      console.log('No data returned from API filtering, attempting client-side filtering')
      console.log('This suggests the Xano API filtering is not working at all')
      try {
        // Test if Xano API is completely ignoring filter parameters (diagnostic only)
        console.log('Testing if Xano API ignores filter parameters...')
        const testResponse = await apiClient.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?mp_client_name=NONEXISTENT_CLIENT_12345`)
        const testData = testResponse.data || []
        console.log('Test query for nonexistent client returned:', testData.length, 'records')
        
        if (testData.length > 0) {
          console.warn('Xano API appears to be ignoring filter parameters')
          console.warn('This is a known issue - client-side filtering is being used to ensure data security')
          console.warn('All data will be properly filtered client-side before being returned')
        }
        
        const allVersionsResponse = await apiClient.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions`)
        const allVersionsData = allVersionsResponse.data || []
        console.log('All versions data length:', allVersionsData.length)
        
        // Debug: Log all unique client names found in the data
        const allClientNames = [...new Set(allVersionsData.map((version: any) => 
          version.mp_client_name
        ))].filter(Boolean)
        console.log('All client names found in data:', allClientNames)
        console.log('Target client name for filtering:', client.name)
        console.log('Sample version data structure:', allVersionsData[0])
        
        // SECURITY DEBUG: Check for data structure issues
        console.log('SECURITY DEBUG - Checking data structure:')
        allVersionsData.forEach((version: any, index: number) => {
          if (index < 5) { // Only log first 5 for debugging
            console.log(`Version ${index}:`, {
              id: version.id,
              mp_client_name: version.mp_client_name,
              mp_client_name_type: typeof version.mp_client_name,
              mp_client_name_length: version.mp_client_name?.length,
              campaign_name: version.campaign_name
            })
          }
        })
        
        // Filter by client name client-side - use standardized field
        const filteredVersions = allVersionsData.filter((version: any) => {
          // Use standardized mp_client_name field
          const versionClientName = version.mp_client_name
          
          // Reject if no client name field is found
          if (!versionClientName) {
            console.log('FILTERING: Rejecting version with no client name:', version.id)
            return false
          }
          
          // SECURITY: Check for array or object in mp_client_name (should be string)
          if (typeof versionClientName !== 'string') {
            console.error('SECURITY ERROR: mp_client_name is not a string:', {
              versionId: version.id,
              mp_client_name: versionClientName,
              type: typeof versionClientName
            })
            return false
          }
          
          // Use helper function for consistent matching
          const isMatch = clientNamesMatch(versionClientName, client.name)
          
          // SECURITY DEBUG: Log every match attempt
          if (isMatch) {
            console.log('FILTERING MATCH:', {
              versionId: version.id,
              versionClientName,
              targetClientName: client.name,
              normalizedVersion: normalizeClientName(versionClientName),
              normalizedTarget: normalizeClientName(client.name)
            })
          }
          
          return isMatch
        })
        console.log('Filtered versions length:', filteredVersions.length)
        
        // CRITICAL SECURITY CHECK: Verify filtered data contains only one client
        if (filteredVersions.length > 0) {
          const filteredClientNames = [...new Set(filteredVersions.map((version: any) => 
            version.mp_client_name
          ))].filter(Boolean)
          console.log('Client names in filtered data:', filteredClientNames)
          
          // SECURITY: Fail immediately if multiple clients detected
          if (filteredClientNames.length > 1) {
            console.error('CRITICAL SECURITY FAILURE: Multiple clients in filtered data:', filteredClientNames)
            console.error('This indicates the filtering logic is fundamentally broken')
            console.error('Returning empty data to prevent data leakage')
            versionsData = []
          } else if (filteredClientNames.length === 1 && !clientNamesMatch(filteredClientNames[0] as string, client.name)) {
            console.error('CRITICAL SECURITY FAILURE: Client name mismatch in filtered data')
            console.error('Expected:', client.name, 'Found:', filteredClientNames[0])
            console.error('This indicates the filtering logic matched wrong client')
            console.error('Returning empty data to prevent data leakage')
            versionsData = []
          } else {
            // Data is safe - proceed
            versionsData = filteredVersions
          }
        } else {
          versionsData = []
        }
      } catch (error) {
        console.log('Error fetching all data:', error)
        versionsData = []
      }
    }

    // Debug: Log the structure of the first version to understand the data format
    if (versionsData.length > 0) {
      console.log('Sample version data structure:', JSON.stringify(versionsData[0], null, 2))
      
      // SAFETY CHECK: Verify that all data belongs to the correct client
      const allClientNames = [...new Set(versionsData.map((version: any) => 
        version.mp_client_name // Use standardized field
      ))].filter(Boolean)
      
      if (allClientNames.length > 1) {
        console.error('SECURITY ISSUE: Multiple clients found in filtered data:', allClientNames)
        console.error('This should not happen - data filtering failed!')
        console.error('This is a critical security vulnerability that must be fixed')
        // Return empty data to prevent data leakage
        versionsData = []
      } else if (allClientNames.length === 1 && !clientNamesMatch(allClientNames[0], client.name)) {
        console.error('SECURITY ISSUE: Client name mismatch in filtered data')
        console.error('Expected:', client.name, 'Found:', allClientNames[0])
        console.error('Normalized expected:', normalizeClientName(client.name))
        console.error('Normalized found:', normalizeClientName(allClientNames[0]))
        // Return empty data to prevent data leakage
        versionsData = []
      }
    } else {
      console.log('WARNING: No campaign data found for client:', client.name)
      console.log('This could mean:')
      console.log('1. The client has no campaigns yet')
      console.log('2. The client name in the database doesn\'t match the expected format')
      console.log('3. The API filtering is not working correctly')
    }

    // FINAL SAFETY CHECK: Ensure we only process data for the correct client
    const finalVersionsData = versionsData.filter((version: any) => {
      // Use standardized field name
      const versionClientName = version.mp_client_name
      
      // Reject if no client name field is found
      if (!versionClientName) {
        console.warn('SECURITY WARNING: Media plan version missing client name field:', version)
        return false
      }
      
      // SECURITY: Additional type check
      if (typeof versionClientName !== 'string') {
        console.error('SECURITY ERROR: Final check - mp_client_name is not a string:', {
          versionId: version.id,
          mp_client_name: versionClientName,
          type: typeof versionClientName
        })
        return false
      }
      
      // Use helper function for consistent matching
      const isMatch = clientNamesMatch(versionClientName, client.name)
      
      // SECURITY DEBUG: Log mismatches in final check
      if (!isMatch) {
        console.warn('SECURITY WARNING: Final check rejected version:', {
          versionId: version.id,
          versionClientName,
          targetClientName: client.name,
          normalizedVersion: normalizeClientName(versionClientName),
          normalizedTarget: normalizeClientName(client.name)
        })
      }
      
      return isMatch
    })
    
    // Additional validation: Check that all remaining data belongs to the correct client
    const finalClientNames = [...new Set(finalVersionsData.map((version: any) => 
      version.mp_client_name
    ))].filter(Boolean)
    
    console.log('FINAL SECURITY CHECK:', {
      finalVersionsDataLength: finalVersionsData.length,
      finalClientNames,
      expectedClient: client.name
    })
    
    if (finalClientNames.length > 1) {
      console.error('CRITICAL SECURITY FAILURE: Multiple clients found in final filtered data:', finalClientNames)
      console.error('This indicates a critical filtering failure!')
      console.error('This is a critical security vulnerability that must be fixed')
      console.error('Returning empty dashboard data to prevent data leakage')
      // Return empty data to prevent data leakage
      return {
        clientName: client.name,
        brandColour: client.brandColour,
        liveCampaigns: 0,
        totalCampaignsYTD: 0,
        spendPast30Days: 0,
        spentYTD: 0,
        liveCampaignsList: [],
        planningCampaignsList: [],
        completedCampaignsList: [],
        spendByMediaType: [],
        spendByCampaign: [],
        monthlySpend: []
      }
    }
    
    if (finalClientNames.length === 1 && !clientNamesMatch(finalClientNames[0], client.name)) {
      console.error('CRITICAL SECURITY FAILURE: Client name mismatch in final filtered data')
      console.error('Expected:', client.name, 'Found:', finalClientNames[0])
      console.error('Normalized expected:', normalizeClientName(client.name))
      console.error('Normalized found:', normalizeClientName(finalClientNames[0]))
      console.error('Returning empty dashboard data to prevent data leakage')
      // Return empty data to prevent data leakage
      return {
        clientName: client.name,
        brandColour: client.brandColour,
        liveCampaigns: 0,
        totalCampaignsYTD: 0,
        spendPast30Days: 0,
        spentYTD: 0,
        liveCampaignsList: [],
        planningCampaignsList: [],
        completedCampaignsList: [],
        spendByMediaType: [],
        spendByCampaign: [],
        monthlySpend: []
      }
    }
    
    console.log('Final data check - versionsData length:', versionsData.length, 'finalVersionsData length:', finalVersionsData.length)
    
    // Filter to keep only the highest version for each unique MBA number
    const highestVersionPerMBA = Object.values(
      finalVersionsData.reduce((acc: Record<string, any>, version: any) => {
        const mbaNumber = version.mba_number;
        if (!mbaNumber) {
          // Skip versions without an MBA number
          return acc;
        }
        const versionNumber = version.version_number || 0;
        if (!acc[mbaNumber] || (acc[mbaNumber].version_number || 0) < versionNumber) {
          acc[mbaNumber] = version;
        }
        return acc;
      }, {} as Record<string, any>)
    );
    
    console.log('Filtered to highest version per MBA - before:', finalVersionsData.length, 'after:', highestVersionPerMBA.length)
    
    // Convert Xano data to our Campaign format
    const clientCampaigns: Campaign[] = highestVersionPerMBA.map((version: any) => {
      const mediaTypes: string[] = []
      
      // Extract media types from boolean flags
      if (version.mp_television) mediaTypes.push('Television')
      if (version.mp_radio) mediaTypes.push('Radio')
      if (version.mp_newspaper) mediaTypes.push('Newspaper')
      if (version.mp_magazines) mediaTypes.push('Magazines')
      if (version.mp_ooh) mediaTypes.push('OOH')
      if (version.mp_cinema) mediaTypes.push('Cinema')
      if (version.mp_digidisplay) mediaTypes.push('Digital Display')
      if (version.mp_digiaudio) mediaTypes.push('Digital Audio')
      if (version.mp_digivideo) mediaTypes.push('Digital Video')
      if (version.mp_bvod) mediaTypes.push('BVOD')
      if (version.mp_integration) mediaTypes.push('Integration')
      if (version.mp_search) mediaTypes.push('Search')
      if (version.mp_socialmedia) mediaTypes.push('Social Media')
      if (version.mp_progdisplay) mediaTypes.push('Programmatic Display')
      if (version.mp_progvideo) mediaTypes.push('Programmatic Video')
      if (version.mp_progbvod) mediaTypes.push('Programmatic BVOD')
      if (version.mp_progaudio) mediaTypes.push('Programmatic Audio')
      if (version.mp_progooh) mediaTypes.push('Programmatic OOH')
      if (version.mp_influencers) mediaTypes.push('Influencers')

      return {
        mbaNumber: version.mba_number || '',
        campaignName: version.campaign_name || '',
        versionNumber: `v${version.version_number || 1}`,
        budget: parseFloat(version.mp_campaignbudget) || 0,
        startDate: version.campaign_start_date || '',
        endDate: version.campaign_end_date || '',
        mediaTypes,
        status: version.campaign_status?.toLowerCase() || 'draft'
      }
    })

    const currentDate = new Date()
    const thirtyDaysAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startOfYear = new Date(currentDate.getFullYear(), 0, 1)

    // Calculate metrics
    const liveCampaigns = clientCampaigns.filter(campaign => 
      (campaign.status === 'approved' || campaign.status === 'booked') && 
      new Date(campaign.startDate) <= currentDate && 
      new Date(campaign.endDate) >= currentDate
    )

    const totalCampaignsYTD = clientCampaigns.filter(campaign => 
      new Date(campaign.startDate) >= startOfYear
    ).length

    // Calculate prorated spend for past 30 days
    const spendPast30Days = clientCampaigns
      .filter(campaign => {
        const campaignStart = new Date(campaign.startDate)
        const campaignEnd = new Date(campaign.endDate)
        return campaignStart <= currentDate && campaignEnd >= thirtyDaysAgo
      })
      .reduce((sum, campaign) => {
        const campaignStart = new Date(campaign.startDate)
        const campaignEnd = new Date(campaign.endDate)
        
        // Calculate total campaign days
        const totalCampaignDays = Math.ceil((campaignEnd.getTime() - campaignStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        
        // Calculate overlap with past 30 days
        const overlapStart = new Date(Math.max(campaignStart.getTime(), thirtyDaysAgo.getTime()))
        const overlapEnd = new Date(Math.min(campaignEnd.getTime(), currentDate.getTime()))
        const overlapDays = Math.max(0, Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
        
        // Calculate daily rate and prorated spend
        const dailyRate = campaign.budget / totalCampaignDays
        const proratedSpend = dailyRate * overlapDays
        
        return sum + proratedSpend
      }, 0)

    const spentYTD = clientCampaigns
      .filter(campaign => {
        const campaignStart = new Date(campaign.startDate)
        return campaignStart >= startOfYear && campaignStart <= currentDate
      })
      .reduce((sum, campaign) => sum + campaign.budget, 0)

    // Categorize campaigns
    const liveCampaignsList = clientCampaigns.filter(campaign => 
      (campaign.status === 'approved' || campaign.status === 'booked') && 
      new Date(campaign.startDate) <= currentDate && 
      new Date(campaign.endDate) >= currentDate
    )

    const planningCampaignsList = clientCampaigns.filter(campaign => 
      campaign.status === 'planning' || campaign.status === 'draft' || new Date(campaign.startDate) > currentDate
    )

    const completedCampaignsList = clientCampaigns.filter(campaign => 
      new Date(campaign.endDate) < currentDate
    )

    // Filter to only booked/approved campaigns for spend analytics
    const bookedApprovedCampaigns = clientCampaigns.filter(campaign => 
      campaign.status === 'booked' || campaign.status === 'approved'
    )

    // Prepare data for line item aggregation (only booked/approved campaigns)
    const mbaNumbers = [...new Set(bookedApprovedCampaigns.map(campaign => campaign.mbaNumber))]
    const versionNumbers = bookedApprovedCampaigns.reduce((acc, campaign) => {
      acc[campaign.mbaNumber] = parseInt(campaign.versionNumber.replace('v', '')) || 1
      return acc
    }, {} as Record<string, number>)

    // Calculate spend analytics from line items
    let spendByMediaType: Array<{
      mediaType: string
      amount: number
      percentage: number
    }> = []
    let spendByCampaign: Array<{
      campaignName: string
      mbaNumber: string
      amount: number
      percentage: number
    }> = []
    let mediaTypeSpend: Record<string, number> = {}
    
    try {
      // Get spend by media type from line items
      spendByMediaType = await getSpendByMediaTypeFromLineItems(mbaNumbers, versionNumbers)
      
      // Get spend by campaign from line items (only booked/approved campaigns)
      const campaignData = bookedApprovedCampaigns.map(campaign => ({
        mbaNumber: campaign.mbaNumber,
        campaignName: campaign.campaignName,
        versionNumber: parseInt(campaign.versionNumber.replace('v', '')) || 1
      }))
      spendByCampaign = await getSpendByCampaignFromLineItems(campaignData)
    } catch (error) {
      console.error('Error fetching spend analytics from line items:', error)
      
      // Fallback to top-level budget calculation (only booked/approved campaigns)
      const campaignSpend: Record<string, number> = {}

      bookedApprovedCampaigns.forEach(campaign => {
        campaign.mediaTypes.forEach(mediaType => {
          mediaTypeSpend[mediaType] = (mediaTypeSpend[mediaType] || 0) + (campaign.budget / campaign.mediaTypes.length)
        })
        campaignSpend[`${campaign.campaignName} (${campaign.mbaNumber})`] = campaign.budget
      })

      const totalSpend = Object.values(mediaTypeSpend).reduce((sum, amount) => sum + amount, 0)

      spendByMediaType = Object.entries(mediaTypeSpend).map(([mediaType, amount]) => ({
        mediaType,
        amount,
        percentage: totalSpend > 0 ? (amount / totalSpend) * 100 : 0
      }))

      spendByCampaign = Object.entries(campaignSpend).map(([campaignName, amount]) => ({
        campaignName,
        mbaNumber: campaignName.match(/\(([^)]+)\)/)?.[1] || '',
        amount,
        percentage: totalSpend > 0 ? (amount / totalSpend) * 100 : 0
      }))
    }
    
    let monthlySpend: Array<{
      month: string
      data: Array<{
        mediaType: string
        amount: number
      }>
    }> = []
    try {
      monthlySpend = await aggregateMonthlySpendByMediaType(mbaNumbers, versionNumbers)
    } catch (error) {
      console.error('Error fetching monthly spend from line items:', error)
      // Fallback to estimation if line items fail
      const allMediaTypes = [...new Set(Object.keys(mediaTypeSpend))]
      monthlySpend = [
        { month: 'Jan', data: allMediaTypes.map(type => ({ mediaType: type, amount: Math.floor((mediaTypeSpend[type] || 0) * 0.1) })) },
        { month: 'Feb', data: allMediaTypes.map(type => ({ mediaType: type, amount: Math.floor((mediaTypeSpend[type] || 0) * 0.15) })) },
        { month: 'Mar', data: allMediaTypes.map(type => ({ mediaType: type, amount: Math.floor((mediaTypeSpend[type] || 0) * 0.2) })) },
        { month: 'Apr', data: allMediaTypes.map(type => ({ mediaType: type, amount: Math.floor((mediaTypeSpend[type] || 0) * 0.18) })) },
        { month: 'May', data: allMediaTypes.map(type => ({ mediaType: type, amount: Math.floor((mediaTypeSpend[type] || 0) * 0.22) })) },
        { month: 'Jun', data: allMediaTypes.map(type => ({ mediaType: type, amount: Math.floor((mediaTypeSpend[type] || 0) * 0.15) })) }
      ]
    }

    // If no real data, provide some sample data for demonstration
    if (spendByMediaType.length === 0) {
      spendByMediaType.push(
        { mediaType: 'Television', amount: 50000, percentage: 40 },
        { mediaType: 'Digital Video', amount: 30000, percentage: 24 },
        { mediaType: 'Social Media', amount: 25000, percentage: 20 },
        { mediaType: 'Radio', amount: 20000, percentage: 16 }
      )
    }

    if (spendByCampaign.length === 0 && bookedApprovedCampaigns.length > 0) {
      // Calculate totalSpend from spendByMediaType for percentage calculation
      const totalSpend = spendByMediaType.reduce((sum, item) => sum + item.amount, 0)
      
      bookedApprovedCampaigns.forEach(campaign => {
        spendByCampaign.push({
          campaignName: campaign.campaignName,
          mbaNumber: campaign.mbaNumber,
          amount: campaign.budget,
          percentage: totalSpend > 0 ? (campaign.budget / totalSpend) * 100 : 0
        })
      })
    }

    const result = {
      clientName: client.name,
      brandColour: client.brandColour,
      liveCampaigns: liveCampaigns.length,
      totalCampaignsYTD,
      spendPast30Days,
      spentYTD,
      liveCampaignsList,
      planningCampaignsList,
      completedCampaignsList,
      spendByMediaType,
      spendByCampaign,
      monthlySpend
    }

    // Debug logging
    console.log('Dashboard data for', client.name, ':', {
      totalCampaigns: clientCampaigns.length,
      liveCampaigns: liveCampaigns.length,
      spendByMediaType: spendByMediaType.length,
      spendByCampaign: spendByCampaign.length
    })

    return result
  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    return null
  }
}

export async function exportDashboardData(slug: string, format: 'csv' | 'json' = 'csv'): Promise<string> {
  const data = await getClientDashboardData(slug)
  if (!data) throw new Error('Client not found')

  if (format === 'json') {
    return JSON.stringify(data, null, 2)
  }

  // Generate CSV
  const csvRows: string[] = []
  
  // Add header
  csvRows.push('Metric,Value')
  csvRows.push(`Live Campaigns,${data.liveCampaigns}`)
  csvRows.push(`Total Campaigns YTD,${data.totalCampaignsYTD}`)
  csvRows.push(`Spend Past 30 Days,${data.spendPast30Days}`)
  csvRows.push(`Spent YTD,${data.spentYTD}`)
  
  // Add campaigns data
  csvRows.push('')
  csvRows.push('Campaigns')
  csvRows.push('MBA Number,Campaign Name,Status,Budget,Start Date,End Date,Media Types')
  
  const allCampaigns = [...data.liveCampaignsList, ...data.planningCampaignsList, ...data.completedCampaignsList]
  allCampaigns.forEach(campaign => {
    csvRows.push(`${campaign.mbaNumber},${campaign.campaignName},${campaign.status},${campaign.budget},${campaign.startDate},${campaign.endDate},"${campaign.mediaTypes.join('; ')}"`)
  })

  return csvRows.join('\n')
}

// Helper functions for async chart loading
export async function getSpendByMediaTypeData(slug: string): Promise<Array<{
  mediaType: string
  amount: number
  percentage: number
}>> {
  const dashboardData = await getClientDashboardData(slug)
  return dashboardData?.spendByMediaType || []
}

export async function getSpendByCampaignData(slug: string): Promise<Array<{
  campaignName: string
  mbaNumber: string
  amount: number
  percentage: number
}>> {
  const dashboardData = await getClientDashboardData(slug)
  return dashboardData?.spendByCampaign || []
}

export async function getMonthlySpendData(slug: string): Promise<Array<{
  month: string
  data: Array<{
    mediaType: string
    amount: number
  }>
}>> {
  const dashboardData = await getClientDashboardData(slug)
  return dashboardData?.monthlySpend || []
}
