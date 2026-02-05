import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { filterLineItemsByPlanNumber } from "@/lib/api/mediaPlanVersionHelper"

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
        const hasVersion = versionNumber !== undefined && versionNumber !== null
        console.log(
          `[API] Fetching line items for MBA ${mbaNumber}${hasVersion ? ` (version ${versionNumber})` : " (no version filter)"}`
        )

        const versionParam = hasVersion ? String(versionNumber) : ""

        // Query Xano with both mba_number + version-scoping parameter to avoid over-fetching
        // and then keep an in-memory filter as a safety net.
        const fetchVersionScoped = async (endpoint: string, mediaTypeLabel: string) => {
          const baseUrl = xanoUrl(endpoint, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
          if (!hasVersion) {
            const res = await axios.get(`${baseUrl}?mba_number=${mbaNumber}`, { headers }).catch(() => ({ data: [] }))
            return Array.isArray(res.data) ? res.data : []
          }

          const attempts: Array<Record<string, any>> = [
            { mba_number: mbaNumber, mp_plannumber: versionNumber },
            { mba_number: mbaNumber, version_number: versionNumber },
          ]

          let bestFiltered: any[] = []
          let bestRawCount = Number.POSITIVE_INFINITY

          for (const params of attempts) {
            const res = await axios.get(baseUrl, { headers, params }).catch(() => ({ data: [] }))
            const raw = Array.isArray(res.data) ? res.data : []
            const filtered = filterLineItemsByPlanNumber(raw, mbaNumber, versionParam, mediaTypeLabel)

            if (
              filtered.length > bestFiltered.length ||
              (filtered.length === bestFiltered.length && raw.length < bestRawCount)
            ) {
              bestFiltered = filtered
              bestRawCount = raw.length
            }

            // If the server-side filter worked, stop early.
            if (raw.length > 0 && raw.length === filtered.length) {
              break
            }
          }

          return bestFiltered
        }
        
        // Fetch line items for all media types in parallel - version scoped
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
          fetchVersionScoped("television_line_items", "television"),
          fetchVersionScoped("radio_line_items", "radio"),
          fetchVersionScoped("search_line_items", "search"),
          fetchVersionScoped("social_media_line_items", "socialMedia"),
          fetchVersionScoped("newspaper_line_items", "newspaper"),
          fetchVersionScoped("magazines_line_items", "magazines"),
          fetchVersionScoped("ooh_line_items", "ooh"),
          fetchVersionScoped("cinema_line_items", "cinema"),
          fetchVersionScoped("digital_display_line_items", "digitalDisplay"),
          fetchVersionScoped("digital_audio_line_items", "digitalAudio"),
          fetchVersionScoped("digital_video_line_items", "digitalVideo"),
          fetchVersionScoped("bvod_line_items", "bvod"),
          fetchVersionScoped("integration_line_items", "integration"),
          fetchVersionScoped("prog_display_line_items", "progDisplay"),
          fetchVersionScoped("prog_video_line_items", "progVideo"),
          fetchVersionScoped("prog_bvod_line_items", "progBvod"),
          fetchVersionScoped("prog_audio_line_items", "progAudio"),
          fetchVersionScoped("prog_ooh_line_items", "progOoh"),
          fetchVersionScoped("influencers_line_items", "influencers"),
        ])
        
        // Results are already version-scoped and safety-filtered
        lineItemsData = {
          television: televisionItems || [],
          radio: radioItems || [],
          search: searchItems || [],
          socialMedia: socialMediaItems || [],
          newspaper: newspaperItems || [],
          magazines: magazinesItems || [],
          ooh: oohItems || [],
          cinema: cinemaItems || [],
          digitalDisplay: digitalDisplayItems || [],
          digitalAudio: digitalAudioItems || [],
          digitalVideo: digitalVideoItems || [],
          bvod: bvodItems || [],
          integration: integrationItems || [],
          progDisplay: progDisplayItems || [],
          progVideo: progVideoItems || [],
          progBvod: progBvodItems || [],
          progAudio: progAudioItems || [],
          progOoh: progOohItems || [],
          influencers: influencersItems || [],
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

    function parseSchedule(input: any, name: string) {
      if (input == null) return null
      if (Array.isArray(input) || typeof input === "object") return input
      if (typeof input === "string" && input.trim() !== "") {
        try {
          return JSON.parse(input)
        } catch {
          throw new Error(`${name} must be valid JSON`)
        }
      }
      return null
    }
    
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

    let parsedBillingSchedule: any = null
    let parsedDeliverySchedule: any = null
    try {
      parsedBillingSchedule = parseSchedule(data.billingSchedule, "billingSchedule")
      parsedDeliverySchedule = parseSchedule(data.deliverySchedule, "deliverySchedule")
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: message }, { status: 400 })
    }
    
    // Format the data to match the media_plan_versions schema
    const newVersionData = {
      version_number: nextVersionNumber,
      mba_number: data.mbanumber || currentVersion.mba_number,
      campaign_name: data.mp_campaignname || currentVersion.campaign_name,
      campaign_status: data.mp_campaignstatus || currentVersion.campaign_status,
      campaign_start_date: data.mp_campaigndates_start || currentVersion.campaign_start_date,
      campaign_end_date: data.mp_campaigndates_end || currentVersion.campaign_end_date,
      brand: data.mp_brand || currentVersion.brand,
      mp_client_name: data.mp_client_name || data.mp_clientname || currentVersion.mp_client_name || currentVersion.client_name,
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
    billingSchedule: parsedBillingSchedule,
    deliverySchedule: parsedDeliverySchedule,
    // Alias to tolerate snake_case in Xano input
    delivery_schedule: parsedDeliverySchedule,
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

