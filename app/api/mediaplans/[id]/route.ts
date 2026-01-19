import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

// GET a single media plan by ID
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    console.log(`Fetching media plan with ID: ${id}`)
    
    // Fetch from media_plan_versions table
    const versionsUrl = `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?id=${id}`
    console.log(`API URL: ${versionsUrl}`)
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    
    const response = await axios.get(versionsUrl, { 
      headers,
      timeout: 10000 
    })
    
    console.log("API response status:", response.status)
    console.log("API response data:", response.data)
    
    if (!response.data) {
      throw new Error("No data received from API")
    }
    
    // Get the media plan version (should be single item or first in array)
    const mediaPlanVersion = Array.isArray(response.data) 
      ? response.data[0]
      : response.data
      
    if (!mediaPlanVersion) {
      return NextResponse.json(
        { error: "Media plan version not found" },
        { status: 404 }
      )
    }

    // If we have an MBA number, fetch related line items
    const mbaNumber = mediaPlanVersion.mba_number
    const versionNumber = mediaPlanVersion.version_number
    let lineItemsData = {}
    
    if (mbaNumber) {
      try {
        // Query ONLY by mba_number to scan entire database
        // Then filter by version_number/mp_plannumber in JavaScript
        console.log(`[API] Fetching line items for MBA ${mbaNumber}${versionNumber !== undefined && versionNumber !== null ? ` (will filter by version ${versionNumber} in JS)` : ' (no version filter)'}`)
        console.log(`[API] Strategy: Query all records matching mba_number, then filter by version_number/mp_plannumber in JavaScript`)
        
        // Helper function to filter line items by version
        const filterByVersion = (items: any[], versionNum: number | undefined | null): any[] => {
          if (!Array.isArray(items)) return []
          if (versionNum === undefined || versionNum === null) {
            return items.filter((item: any) => item.mba_number === mbaNumber)
          }
          return items.filter((item: any) => {
            const itemVersion = typeof item.version_number === 'string' 
              ? parseInt(item.version_number, 10) 
              : item.version_number
            const itemPlan = typeof item.mp_plannumber === 'string'
              ? parseInt(item.mp_plannumber, 10)
              : item.mp_plannumber
            return (itemVersion === versionNum || itemPlan === versionNum) && 
                   item.mba_number === mbaNumber
          })
        }
        
        // Fetch line items for all media types in parallel - query ONLY by mba_number
        const [
          televisionItems,
          radioItems,
          searchItems,
          socialMediaItems,
          newspaperItems,
          magazinesItems,
          oohItems,
          cinemaItems,
          digitalDisplayItems,
          digitalAudioItems,
          digitalVideoItems,
          bvodItems,
          integrationItems,
          progDisplayItems,
          progVideoItems,
          progBvodItems,
          progAudioItems,
          progOohItems,
          influencersItems
        ] = await Promise.all([
          axios.get(`${xanoUrl("television_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("radio_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("search_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("social_media_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("newspaper_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("magazines_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("ooh_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("cinema_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("digital_display_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("digital_audio_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("digital_video_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("bvod_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("integration_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("prog_display_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("prog_video_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("prog_bvod_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("prog_audio_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("prog_ooh_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] })),
          axios.get(`${xanoUrl("influencers_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] }))
        ])
        
        // Filter all results by version_number/mp_plannumber in JavaScript
        lineItemsData = {
          television: filterByVersion(televisionItems.data || [], versionNumber),
          radio: filterByVersion(radioItems.data || [], versionNumber),
          search: filterByVersion(searchItems.data || [], versionNumber),
          socialMedia: filterByVersion(socialMediaItems.data || [], versionNumber),
          newspaper: filterByVersion(newspaperItems.data || [], versionNumber),
          magazines: filterByVersion(magazinesItems.data || [], versionNumber),
          ooh: filterByVersion(oohItems.data || [], versionNumber),
          cinema: filterByVersion(cinemaItems.data || [], versionNumber),
          digitalDisplay: filterByVersion(digitalDisplayItems.data || [], versionNumber),
          digitalAudio: filterByVersion(digitalAudioItems.data || [], versionNumber),
          digitalVideo: filterByVersion(digitalVideoItems.data || [], versionNumber),
          bvod: filterByVersion(bvodItems.data || [], versionNumber),
          integration: filterByVersion(integrationItems.data || [], versionNumber),
          progDisplay: filterByVersion(progDisplayItems.data || [], versionNumber),
          progVideo: filterByVersion(progVideoItems.data || [], versionNumber),
          progBvod: filterByVersion(progBvodItems.data || [], versionNumber),
          progAudio: filterByVersion(progAudioItems.data || [], versionNumber),
          progOoh: filterByVersion(progOohItems.data || [], versionNumber),
          influencers: filterByVersion(influencersItems.data || [], versionNumber)
        }
      } catch (lineItemsError) {
        console.error("Error fetching line items:", lineItemsError)
        // Continue without line items if they fail
      }
    }
    
    // Combine media plan version with line items
    const combinedData = {
      ...mediaPlanVersion,
      lineItems: lineItemsData
    }
    
    return NextResponse.json(combinedData)
  } catch (error) {
    console.error("Error fetching media plan:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
      })
      
      return NextResponse.json(
        { 
          error: `Failed to fetch media plan: ${error.response?.data?.message || error.message}`,
          details: {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            url: error.config?.url,
          }
        },
        { status: error.response?.status || 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: "Failed to fetch media plan", 
        details: error 
      },
      { status: 500 }
    )
  }
}

// PUT (update) a media plan by ID - creates new version for version control
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const data = await request.json()
    
    console.log(`Creating new version for media plan with ID: ${id}`)
    console.log("Update data:", data)
    
    // First, get the current version to get the media_plan_master_id and determine next version number
    const currentVersionResponse = await axios.get(
      `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?id=${id}`
    )
    const currentVersion = Array.isArray(currentVersionResponse.data) 
      ? currentVersionResponse.data[0]
      : currentVersionResponse.data
      
    if (!currentVersion) {
      return NextResponse.json(
        { error: "Current media plan version not found" },
        { status: 404 }
      )
    }

    // Get all versions for this media plan master to determine next version number
    const allVersionsResponse = await axios.get(
      `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?media_plan_master_id=${currentVersion.media_plan_master_id}`
    )
    const allVersions = Array.isArray(allVersionsResponse.data) ? allVersionsResponse.data : [allVersionsResponse.data]
    const nextVersionNumber = Math.max(...allVersions.map(v => v.version_number)) + 1
    
    // Format the data to match the media_plan_versions schema
    const newVersionData = {
      version_number: nextVersionNumber,
      mba_number: data.mbanumber || currentVersion.mba_number,
      campaign_name: data.mp_campaignname || currentVersion.campaign_name,
      campaign_status: data.mp_campaignstatus || currentVersion.campaign_status,
      campaign_start_date: data.mp_campaigndates_start || currentVersion.campaign_start_date,
      campaign_end_date: data.mp_campaigndates_end || currentVersion.campaign_end_date,
      brand: data.mp_brand || currentVersion.brand,
      client_name: data.mp_client_name || currentVersion.client_name,
      client_contact: data.mp_clientcontact || currentVersion.client_contact,
      po_number: data.mp_ponumber || currentVersion.po_number,
      mp_campaignbudget: data.mp_campaignbudget || currentVersion.mp_campaignbudget,
      fixed_fee: data.mp_fixedfee || currentVersion.fixed_fee || false,
      mp_television: data.mp_television || currentVersion.mp_television || false,
      mp_radio: data.mp_radio || currentVersion.mp_radio || false,
      mp_newspaper: data.mp_newspaper || currentVersion.mp_newspaper || false,
      mp_magazines: data.mp_magazines || currentVersion.mp_magazines || false,
      mp_ooh: data.mp_ooh || currentVersion.mp_ooh || false,
      mp_cinema: data.mp_cinema || currentVersion.mp_cinema || false,
      mp_digidisplay: data.mp_digidisplay || currentVersion.mp_digidisplay || false,
      mp_digiaudio: data.mp_digiaudio || currentVersion.mp_digiaudio || false,
      mp_digivideo: data.mp_digivideo || currentVersion.mp_digivideo || false,
      mp_bvod: data.mp_bvod || currentVersion.mp_bvod || false,
      mp_integration: data.mp_integration || currentVersion.mp_integration || false,
      mp_search: data.mp_search || currentVersion.mp_search || false,
      mp_socialmedia: data.mp_socialmedia || currentVersion.mp_socialmedia || false,
      mp_progdisplay: data.mp_progdisplay || currentVersion.mp_progdisplay || false,
      mp_progvideo: data.mp_progvideo || currentVersion.mp_progvideo || false,
      mp_progbvod: data.mp_progbvod || currentVersion.mp_progbvod || false,
      mp_progaudio: data.mp_progaudio || currentVersion.mp_progaudio || false,
      mp_progooh: data.mp_progooh || currentVersion.mp_progooh || false,
    mp_influencers: data.mp_influencers || currentVersion.mp_influencers || false,
    billingSchedule: data.billingSchedule || currentVersion.billingSchedule || null,
    deliverySchedule: data.deliverySchedule || currentVersion.deliverySchedule || null,
    // Alias to tolerate snake_case in Xano input
    delivery_schedule: data.deliverySchedule || currentVersion.delivery_schedule || currentVersion.deliverySchedule || null,
    media_plan_master_id: currentVersion.media_plan_master_id
    }
    
    // Create new version in media_plan_versions table
    const response = await axios.post(
      xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      newVersionData
    )
    
    console.log("New version created:", response.data)
    
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Error creating new media plan version:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
      })
      
      return NextResponse.json(
        { 
          error: `Failed to create new version: ${error.response?.data?.message || error.message}`,
          details: {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            url: error.config?.url,
          }
        },
        { status: error.response?.status || 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: "Failed to create new version", 
        details: error 
      },
      { status: 500 }
    )
  }
}

