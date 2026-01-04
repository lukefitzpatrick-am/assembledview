import { NextResponse } from "next/server"
import axios from "axios"
import { toMelbourneDateString } from "@/lib/timezone"

type MediaLineItems = {
  television: any[]
  radio: any[]
  search: any[]
  socialMedia: any[]
  newspaper: any[]
  magazines: any[]
  ooh: any[]
  cinema: any[]
  digitalDisplay: any[]
  digitalAudio: any[]
  digitalVideo: any[]
  bvod: any[]
  integration: any[]
  progDisplay: any[]
  progVideo: any[]
  progBvod: any[]
  progAudio: any[]
  progOoh: any[]
  influencers: any[]
}

const createEmptyLineItems = (): MediaLineItems => ({
  television: [],
  radio: [],
  search: [],
  socialMedia: [],
  newspaper: [],
  magazines: [],
  ooh: [],
  cinema: [],
  digitalDisplay: [],
  digitalAudio: [],
  digitalVideo: [],
  bvod: [],
  integration: [],
  progDisplay: [],
  progVideo: [],
  progBvod: [],
  progAudio: [],
  progOoh: [],
  influencers: []
})

const MEDIA_PLANS_VERSIONS_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
const MEDIA_PLAN_MASTER_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"

// GET latest version by MBA number
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number } = await params
    console.log(`[API] Received request for MBA number: "${mba_number}"`)
    console.log(`[API] MBA number type: ${typeof mba_number}, length: ${mba_number?.length}`)
    
    // First, get the MediaPlanMaster by MBA number
    const masterQueryUrl = `${MEDIA_PLAN_MASTER_URL}/media_plan_master?mba_number=${encodeURIComponent(mba_number)}`
    console.log(`[API] Querying master with URL: ${masterQueryUrl}`)
    console.log(`[API] Master API Database: ${MEDIA_PLAN_MASTER_URL}`)
    console.log(`[API] Master Endpoint: media_plan_master`)
    console.log(`[API] Requested MBA number: "${mba_number}" (type: ${typeof mba_number}, length: ${mba_number?.length})`)
    
    const masterResponse = await axios.get(masterQueryUrl)
    
    // Log raw response to see what Xano is actually returning
    console.log(`[API] Raw Xano response:`, {
      isArray: Array.isArray(masterResponse.data),
      arrayLength: Array.isArray(masterResponse.data) ? masterResponse.data.length : 'N/A',
      dataType: typeof masterResponse.data,
      rawData: masterResponse.data
    })
    
    // Handle array response - find the exact match (no fallback to first record)
    const normalize = (value: any) => String(value ?? '').trim().toLowerCase()
    const requestedNormalized = normalize(mba_number)
    let masterData: any = null
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => normalize(item?.mba_number) === requestedNormalized) || null
    } else if (masterResponse.data && typeof masterResponse.data === 'object') {
      const candidate = masterResponse.data as any
      masterData = normalize(candidate?.mba_number) === requestedNormalized ? candidate : null
    }
    
    // CRITICAL: Ensure we use version_number from media_plan_master
    const masterVersionNumber = masterData?.version_number
    
    console.log(`[API] Master data response:`, {
      found: !!masterData,
      id: masterData?.id,
      mbaNumber: masterData?.mba_number,
      versionNumber: masterVersionNumber,
      usingVersionNumber: true // Explicitly indicate we're using version_number
    })
    
    // Validate that we got the correct MBA number
    if (masterData && masterData.mba_number !== mba_number) {
      console.error(`[API] MBA number mismatch! Requested: "${mba_number}", Got: "${masterData.mba_number}"`)
      return NextResponse.json(
        { 
          error: `MBA number mismatch: requested "${mba_number}" but received data for "${masterData.mba_number}". This indicates a database query issue.`,
          requestedMbaNumber: mba_number,
          receivedMbaNumber: masterData.mba_number
        },
        { status: 500 }
      )
    }
    
    if (!masterData) {
      console.error(`[API] Master not found for MBA: ${mba_number}`)
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 }
      )
    }
    
    console.log(`[API] Successfully found master data for MBA: ${mba_number}`)
    
    // Ensure we have version_number from master (required field)
    if (!masterData.version_number && masterData.version_number !== 0) {
      console.error(`[API] ERROR: masterData is missing version_number field!`, masterData)
      return NextResponse.json(
        { 
          error: `Media plan master data is missing version_number field for MBA number: ${mba_number}`,
          requestedMbaNumber: mba_number
        },
        { status: 500 }
      )
    }

    // Parse requested version from query (optional)
    const url = new URL(request.url)
    const requestedVersionParam = url.searchParams.get('version')
    const requestedVersionNumber = requestedVersionParam ? parseInt(requestedVersionParam, 10) : null
    
    // Fetch ALL versions for this MBA to derive target and latest
    const versionsResponse = await axios.get(
      `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?mba_number=${encodeURIComponent(mba_number)}`
    )
    
    const allVersionsForMBA = Array.isArray(versionsResponse.data)
      ? versionsResponse.data.filter((v: any) => normalize(v?.mba_number) === requestedNormalized)
      : []
    
    const parseVersion = (value: any): number | null => {
      if (value === null || value === undefined) return null
      const num = typeof value === 'string' ? parseInt(value, 10) : value
      return isNaN(num) ? null : num
    }
    
    const versionsMetadata = allVersionsForMBA.map((v: any) => ({
      id: v.id,
      version_number: parseVersion(v.version_number) ?? 0,
      created_at: v.created_at ?? v.createdAt ?? v.created ?? null
    }))
    
    const latestVersionNumber = versionsMetadata.length > 0
      ? Math.max(...versionsMetadata.map(v => v.version_number || 0))
      : parseVersion(masterData?.version_number) ?? 0
    
    const nextVersionNumber = (latestVersionNumber || 0) + 1
    
    // Choose target version: requested > master version > latest available > 1
    // Default to the latest version when none is requested
    let targetVersionNumber = requestedVersionNumber ?? latestVersionNumber ?? parseVersion(masterData?.version_number) ?? 1
    
    let versionData = allVersionsForMBA.find((v: any) => parseVersion(v.version_number) === targetVersionNumber) || null
    
    if (requestedVersionNumber !== null && !versionData) {
      console.error(`[API] Requested version ${requestedVersionNumber} not found for mba_number ${mba_number}`)
      return NextResponse.json(
        { 
          error: `Media plan version ${requestedVersionNumber} not found for MBA number ${mba_number}`,
          requestedVersion: requestedVersionNumber,
          requestedMbaNumber: mba_number
        },
        { status: 404 }
      )
    }
    
    // Fallback to latest if target missing
    if (!versionData && allVersionsForMBA.length > 0) {
      versionData = allVersionsForMBA.sort((a: any, b: any) => (parseVersion(b.version_number) || 0) - (parseVersion(a.version_number) || 0))[0]
      targetVersionNumber = parseVersion(versionData?.version_number) || targetVersionNumber
      console.warn(`[API] Target version missing, using latest version ${targetVersionNumber} for mba_number ${mba_number}`)
    }
    
    // Final validation
    if (!versionData) {
      console.error(`[API] No versions found for MBA: ${mba_number}`)
      return NextResponse.json(
        { error: `No media plan versions found for MBA number ${mba_number}` },
        { status: 404 }
      )
    }
    
    console.log(`[API] Using version ${targetVersionNumber} for mba_number: ${mba_number}`)
    
    console.log(`[API] Successfully found version data for mba_number: ${mba_number}`)

    // Check if line items should be skipped for faster initial load
    // Note: url was already parsed above for version parameter
    const skipLineItems = url.searchParams.get('skipLineItems') === 'true'
    
    // If we have an MBA number and line items aren't skipped, fetch related line items
    let lineItemsData: MediaLineItems = createEmptyLineItems()
    
    if (mba_number && !skipLineItems) {
      try {
        // Always use the target version (requested or derived) for line items
        const versionNumberForLineItems = targetVersionNumber
        console.log(`[API] Fetching line items for MBA: ${mba_number}, version: ${versionNumberForLineItems} (requested: ${targetVersionNumber || 'latest'})`)
        console.log(`[API] Strategy: Query with mba_number AND version_number parameters, then filter by version_number/mp_plannumber in JavaScript as safety net`)
        console.log(`[API] Version matching details:`, {
          requestedVersion: targetVersionNumber,
          versionDataVersion: versionData?.version_number,
          latestVersionNumber: latestVersionNumber,
          versionNumberForLineItems: versionNumberForLineItems,
          mba_number: mba_number,
          willFilterBy: ['version_number', 'mp_plannumber'],
          matchingLogic: 'OR (either field matches) AND mba_number matches'
        })
        
        // Helper function to filter media container items by version_number or mp_plannumber
        // Checks both fields to ensure we match items regardless of which field is used
        // This is a safety net - the query should already filter by version_number, but we ensure ALL entries are checked
        const filterByVersion = (items: any[], versionNumber: number, mediaType?: string): any[] => {
          if (!Array.isArray(items)) return []
          
          // Log sample items for debugging (first item only to avoid spam)
          if (items.length > 0 && mediaType) {
            const sampleItem = items[0]
            console.log(`[API] Sample ${mediaType} item fields:`, {
              mba_number: sampleItem.mba_number,
              version_number: sampleItem.version_number,
              mp_plannumber: sampleItem.mp_plannumber,
              has_version_number: 'version_number' in sampleItem,
              has_mp_plannumber: 'mp_plannumber' in sampleItem,
              totalItems: items.length,
              filteringFor: { mba_number, versionNumber }
            })
          }
          
          // Filter ALL items - ensure we check every entry, not just the first match
          const filtered = items.filter((item: any) => {
            // Check both version_number and mp_plannumber fields
            const itemVersion = typeof item.version_number === 'string' 
              ? parseInt(item.version_number, 10) 
              : item.version_number
            const itemPlan = typeof item.mp_plannumber === 'string'
              ? parseInt(item.mp_plannumber, 10)
              : item.mp_plannumber
            
            // Match if either field matches the requested version AND mba_number matches
            const versionMatches = (itemVersion === versionNumber || itemPlan === versionNumber)
            const mbaMatches = item.mba_number === mba_number
            
            if (!versionMatches || !mbaMatches) {
              console.debug(`[API] Filtered out ${mediaType || 'item'}: mba_number=${item.mba_number} (expected ${mba_number}), version_number=${itemVersion}, mp_plannumber=${itemPlan} (expected ${versionNumber})`)
            }
            
            return versionMatches && mbaMatches
          })
          
          if (mediaType && filtered.length !== items.length) {
            console.log(`[API] ${mediaType} filtering: ${items.length} total items, ${filtered.length} matched (mba_number: ${mba_number}, version: ${versionNumber})`)
          }
          
          return filtered
        }
        
        // Build query URLs with both mba_number AND version_number parameters
        // This ensures we query with both parameters from the start
        const versionParam = versionNumberForLineItems ? `&version_number=${encodeURIComponent(versionNumberForLineItems)}` : ''
        const mpPlanParam = versionNumberForLineItems ? `&mp_plannumber=${encodeURIComponent(versionNumberForLineItems)}` : ''
        
        // Fetch line items for all media types in parallel - query with BOTH mba_number AND version_number
        // Then filter by version_number/mp_plannumber in JavaScript as safety net to ensure we scan entire database
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
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_television?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_radio?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_search?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_social?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_newspaper?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_magazines?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_ooh?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_cinema?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_digi_display?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_digi_audio?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_digi_video?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_digi_bvod?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_integration?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_prog_display?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_prog_video?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_prog_bvod?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_prog_audio?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_prog_ooh?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] })),
          axios.get(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_influencers?mba_number=${encodeURIComponent(mba_number)}${versionParam}${mpPlanParam}`).catch(() => ({ data: [] }))
        ])

        // Filter all results by version_number or mp_plannumber (both must match mba_number AND version)
        lineItemsData = {
          television: filterByVersion(televisionItems.data || [], versionNumberForLineItems, 'television'),
          radio: filterByVersion(radioItems.data || [], versionNumberForLineItems, 'radio'),
          search: filterByVersion(searchItems.data || [], versionNumberForLineItems, 'search'),
          socialMedia: filterByVersion(socialMediaItems.data || [], versionNumberForLineItems, 'socialMedia'),
          newspaper: filterByVersion(newspaperItems.data || [], versionNumberForLineItems, 'newspaper'),
          magazines: filterByVersion(magazinesItems.data || [], versionNumberForLineItems, 'magazines'),
          ooh: filterByVersion(oohItems.data || [], versionNumberForLineItems, 'ooh'),
          cinema: filterByVersion(cinemaItems.data || [], versionNumberForLineItems, 'cinema'),
          digitalDisplay: filterByVersion(digitalDisplayItems.data || [], versionNumberForLineItems, 'digitalDisplay'),
          digitalAudio: filterByVersion(digitalAudioItems.data || [], versionNumberForLineItems, 'digitalAudio'),
          digitalVideo: filterByVersion(digitalVideoItems.data || [], versionNumberForLineItems, 'digitalVideo'),
          bvod: filterByVersion(bvodItems.data || [], versionNumberForLineItems, 'bvod'),
          integration: filterByVersion(integrationItems.data || [], versionNumberForLineItems, 'integration'),
          progDisplay: filterByVersion(progDisplayItems.data || [], versionNumberForLineItems, 'progDisplay'),
          progVideo: filterByVersion(progVideoItems.data || [], versionNumberForLineItems, 'progVideo'),
          progBvod: filterByVersion(progBvodItems.data || [], versionNumberForLineItems, 'progBvod'),
          progAudio: filterByVersion(progAudioItems.data || [], versionNumberForLineItems, 'progAudio'),
          progOoh: filterByVersion(progOohItems.data || [], versionNumberForLineItems, 'progOoh'),
          influencers: filterByVersion(influencersItems.data || [], versionNumberForLineItems, 'influencers')
        }
        
        // Calculate totals for validation logging
        const totalLineItemsBeforeFilter = [
          televisionItems.data || [],
          radioItems.data || [],
          searchItems.data || [],
          socialMediaItems.data || [],
          newspaperItems.data || [],
          magazinesItems.data || [],
          oohItems.data || [],
          cinemaItems.data || [],
          digitalDisplayItems.data || [],
          digitalAudioItems.data || [],
          digitalVideoItems.data || [],
          bvodItems.data || [],
          integrationItems.data || [],
          progDisplayItems.data || [],
          progVideoItems.data || [],
          progBvodItems.data || [],
          progAudioItems.data || [],
          progOohItems.data || [],
          influencersItems.data || []
        ].reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)
        
        const totalLineItemsAfterFilter = Object.values(lineItemsData).reduce(
          (sum: number, items: any) => sum + (Array.isArray(items) ? items.length : 0), 
          0
        )
        
        console.log(`[API] Filtered line items by version ${versionNumberForLineItems} (mba_number: ${mba_number}):`, {
          television: lineItemsData.television.length,
          radio: lineItemsData.radio.length,
          search: lineItemsData.search.length,
          socialMedia: lineItemsData.socialMedia.length,
          newspaper: lineItemsData.newspaper.length,
          magazines: lineItemsData.magazines.length,
          ooh: lineItemsData.ooh.length,
          cinema: lineItemsData.cinema.length,
          digitalDisplay: lineItemsData.digitalDisplay.length,
          digitalAudio: lineItemsData.digitalAudio.length,
          digitalVideo: lineItemsData.digitalVideo.length,
          bvod: lineItemsData.bvod.length,
          integration: lineItemsData.integration.length,
          progDisplay: lineItemsData.progDisplay.length,
          progVideo: lineItemsData.progVideo.length,
          progBvod: lineItemsData.progBvod.length,
          progAudio: lineItemsData.progAudio.length,
          progOoh: lineItemsData.progOoh.length,
          influencers: lineItemsData.influencers.length,
          filteringCriteria: {
            mba_number: mba_number,
            version_number: versionNumberForLineItems,
            checksBothFields: true
          },
          validation: {
            totalItemsBeforeFilter: totalLineItemsBeforeFilter,
            totalItemsAfterFilter: totalLineItemsAfterFilter,
            itemsFilteredOut: totalLineItemsBeforeFilter - totalLineItemsAfterFilter,
            queryStrategy: 'Query with mba_number AND version_number, then filter in JS as safety net',
            ensuresAllEntriesChecked: true
          }
        })
        
        // Validation: Log if we found multiple entries with same mba_number and version_number
        const mediaTypesWithMultipleItems = Object.entries(lineItemsData)
          .filter(([_, items]: [string, any]) => Array.isArray(items) && items.length > 1)
          .map(([type, _]) => type)
        
        if (mediaTypesWithMultipleItems.length > 0) {
          console.log(`[API] ✓ Validation: Found multiple line items for ${mediaTypesWithMultipleItems.length} media type(s), confirming we're not stopping at first match:`, mediaTypesWithMultipleItems)
        }
      } catch (lineItemsError) {
        console.error("Error fetching line items:", lineItemsError)
        // Continue without line items if they fail
      }
    }
    
    // Combine master, version, and line items data
    // Explicitly include billingSchedule from versionData to ensure it's not lost
    // Check for billingSchedule in various possible field names (camelCase, snake_case, etc.)
    const billingSchedule = versionData.billingSchedule || 
                           versionData.billing_schedule || 
                           masterData.billingSchedule || 
                           masterData.billing_schedule || 
                           null
    
    // If billingSchedule is a string, try to parse it as JSON
    let parsedBillingSchedule = billingSchedule
    if (typeof billingSchedule === 'string' && billingSchedule.trim() !== '') {
      try {
        parsedBillingSchedule = JSON.parse(billingSchedule)
      } catch (e) {
        console.warn(`[API] Failed to parse billingSchedule as JSON:`, e)
        parsedBillingSchedule = billingSchedule
      }
    }
    
    // Ensure version_number is explicitly set from versionData to avoid being overridden by masterData
    // If a specific version was requested, we MUST use that version (it should already be in versionData)
    // Priority: targetVersionNumber (if requested) > versionData.version_number > latestVersionNumber > masterData.version_number
    let actualVersionNumber: number
    if (targetVersionNumber !== null) {
      // If a version was requested, we MUST use that version (it should already be in versionData)
      actualVersionNumber = targetVersionNumber
      console.log(`[API] Using requested version: ${actualVersionNumber} (from query parameter)`)
    } else if (versionData?.version_number !== undefined && versionData.version_number !== null) {
      actualVersionNumber = typeof versionData.version_number === 'string' 
        ? parseInt(versionData.version_number, 10) 
        : versionData.version_number
      console.log(`[API] Using version from versionData: ${actualVersionNumber}`)
    } else if (latestVersionNumber !== undefined && latestVersionNumber !== null) {
      actualVersionNumber = latestVersionNumber
      console.log(`[API] Using latestVersionNumber: ${actualVersionNumber}`)
    } else {
      actualVersionNumber = masterData?.version_number || 1
      console.log(`[API] Using masterData version (fallback): ${actualVersionNumber}`)
    }
    
    console.log(`[API] Setting version_number in combined data:`, {
      versionDataVersion: versionData?.version_number,
      latestVersionNumber: latestVersionNumber,
      masterDataVersion: masterData?.version_number,
      actualVersionNumber: actualVersionNumber,
      requestedVersion: targetVersionNumber,
      source: targetVersionNumber !== null ? 'query parameter' : (versionData?.version_number ? 'versionData' : 'fallback')
    })
    
    // CRITICAL: If a version was requested, ensure versionData matches (it should have been validated above)
    if (targetVersionNumber !== null && versionData && versionData.version_number !== undefined) {
      const versionDataVersion = typeof versionData.version_number === 'string' 
        ? parseInt(versionData.version_number, 10) 
        : versionData.version_number
      if (versionDataVersion !== targetVersionNumber) {
        console.error(`[API] CRITICAL ERROR: versionData has wrong version! Expected ${targetVersionNumber}, got ${versionDataVersion}`)
        return NextResponse.json(
          { 
            error: `Version data mismatch: expected version ${targetVersionNumber} but versionData has version ${versionDataVersion}`,
            requestedVersion: targetVersionNumber,
            versionDataVersion: versionDataVersion
          },
          { status: 500 }
        )
      }
    }
    
    const combinedData = {
      ...masterData,
      ...versionData,
      version_number: actualVersionNumber, // Explicitly set to ensure correct version is returned
      billingSchedule: parsedBillingSchedule,
      lineItems: lineItemsData,
      versions: versionsMetadata.sort((a, b) => (a.version_number || 0) - (b.version_number || 0)),
      latestVersionNumber,
      nextVersionNumber
    }
    
    // Final validation that the returned version matches the requested version
    if (targetVersionNumber !== null && combinedData.version_number !== targetVersionNumber) {
      console.error(`[API] CRITICAL ERROR: Version mismatch in final response! Requested: ${targetVersionNumber}, Returning: ${combinedData.version_number}`)
      console.error(`[API] This should never happen - the version was explicitly set above`)
      // Force the correct version
      combinedData.version_number = targetVersionNumber
      console.error(`[API] Forced version_number to ${targetVersionNumber} in response`)
    } else if (targetVersionNumber !== null && combinedData.version_number === targetVersionNumber) {
      console.log(`[API] ✓ Version match confirmed: Requested ${targetVersionNumber}, Returning ${combinedData.version_number}`)
    }
    
    console.log(`[API] Returning combined data for MBA: ${mba_number}`, {
      mbaNumber: combinedData.mba_number,
      versionNumber: combinedData.version_number,
      versionNumberType: typeof combinedData.version_number,
      requestedVersion: targetVersionNumber,
      versionMatches: targetVersionNumber !== null ? combinedData.version_number === targetVersionNumber : 'N/A',
      clientName: combinedData.mp_client_name || combinedData.client_name,
      hasBillingSchedule: !!combinedData.billingSchedule,
      billingScheduleType: typeof combinedData.billingSchedule,
      billingScheduleIsArray: Array.isArray(combinedData.billingSchedule),
      billingScheduleLength: Array.isArray(combinedData.billingSchedule) ? combinedData.billingSchedule.length : 'N/A',
      lineItemsCount: Object.keys(lineItemsData).reduce((sum, key) => sum + (lineItemsData[key]?.length || 0), 0)
    })
    
    return NextResponse.json(combinedData)
  } catch (error) {
    console.error("Error fetching media plan by MBA:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        code: error.code,
      })
      
      // Handle network errors (no response)
      if (!error.response) {
        return NextResponse.json(
          { 
            error: `Network error: ${error.message || "Failed to connect to API"}`,
            code: error.code || "NETWORK_ERROR"
          },
          { status: 503 }
        )
      }
      
      // Extract error message from response
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          error.message || 
                          "Failed to fetch media plan"
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.config?.url,
            message: error.message,
          }
        },
        { status: error.response.status || 500 }
      )
    }
    
    // Handle non-axios errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    return NextResponse.json(
      { 
        error: `Failed to fetch media plan: ${errorMessage}`,
        message: errorMessage
      },
      { status: 500 }
    )
  }
}

// PUT (update) a media plan by MBA number - creates new version for version control
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number } = await params
    const data = await request.json()
    
    console.log(`Creating new version for media plan with MBA: ${mba_number}`)
    console.log("Update data:", data)
    
    // First, get the MediaPlanMaster by MBA number (require exact match)
    const masterResponse = await axios.get(`${MEDIA_PLAN_MASTER_URL}/media_plan_master?mba_number=${mba_number}`)
    const normalize = (value: any) => String(value ?? '').trim().toLowerCase()
    const requestedNormalized = normalize(mba_number)
    const masterData = Array.isArray(masterResponse.data)
      ? masterResponse.data.find((item: any) => normalize(item?.mba_number) === requestedNormalized) || null
      : (masterResponse.data && normalize((masterResponse.data as any).mba_number) === requestedNormalized
        ? masterResponse.data
        : null)
    
    if (!masterData) {
      console.error(`[PUT] Media plan master not found for MBA: "${mba_number}"`)
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 }
      )
    }

    // Calculate next version number based on max existing version for this MBA
    const versionsResponse = await axios.get(
      `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?mba_number=${encodeURIComponent(mba_number)}`
    ).catch(() => ({ data: [] }))
    
    const allVersionsForMBA = Array.isArray(versionsResponse.data)
      ? versionsResponse.data.filter((v: any) => normalize(v?.mba_number) === requestedNormalized)
      : []
    
    const parseVersion = (value: any): number => {
      const num = typeof value === 'string' ? parseInt(value, 10) : value
      return isNaN(num) ? 0 : num
    }
    
    const latestVersionNumber = allVersionsForMBA.length > 0
      ? Math.max(...allVersionsForMBA.map((v: any) => parseVersion(v.version_number)))
      : parseVersion(masterData.version_number)
    
    const nextVersionNumber = (latestVersionNumber || 0) + 1
    
    const campaignStartDate = data.mp_campaigndates_start ?? masterData.campaign_start_date
    const campaignEndDate = data.mp_campaigndates_end ?? masterData.campaign_end_date
    const normalizedCampaignStartDate = campaignStartDate ? toMelbourneDateString(campaignStartDate) : campaignStartDate
    const normalizedCampaignEndDate = campaignEndDate ? toMelbourneDateString(campaignEndDate) : campaignEndDate

    // Format the data to match the media_plan_versions schema
    const newVersionData = {
      media_plan_master_id: masterData.id,
      version_number: nextVersionNumber,
      mba_number: mba_number,
      campaign_name: data.mp_campaignname || masterData.mp_campaignname,
      campaign_status: data.mp_campaignstatus || masterData.campaign_status,
      campaign_start_date: normalizedCampaignStartDate,
      campaign_end_date: normalizedCampaignEndDate,
      brand: data.mp_brand || "",
      client_name: data.mp_client_name || masterData.mp_client_name,
      client_contact: data.mp_clientcontact || "",
      po_number: data.mp_ponumber || "",
      mp_campaignbudget: data.mp_campaignbudget || masterData.mp_campaignbudget,
      fixed_fee: data.mp_fixedfee || false,
      mp_television: data.mp_television || false,
      mp_radio: data.mp_radio || false,
      mp_newspaper: data.mp_newspaper || false,
      mp_magazines: data.mp_magazines || false,
      mp_ooh: data.mp_ooh || false,
      mp_cinema: data.mp_cinema || false,
      mp_digidisplay: data.mp_digidisplay || false,
      mp_digiaudio: data.mp_digiaudio || false,
      mp_digivideo: data.mp_digivideo || false,
      mp_bvod: data.mp_bvod || false,
      mp_integration: data.mp_integration || false,
      mp_search: data.mp_search || false,
      mp_socialmedia: data.mp_socialmedia || false,
      mp_progdisplay: data.mp_progdisplay || false,
      mp_progvideo: data.mp_progvideo || false,
      mp_progbvod: data.mp_progbvod || false,
      mp_progaudio: data.mp_progaudio || false,
      mp_progooh: data.mp_progooh || false,
      mp_influencers: data.mp_influencers || false,
      billingSchedule: data.billingSchedule || null,
      deliverySchedule: data.deliverySchedule || null,
    }
    
    // Create new version in media_plan_versions table
    const versionResponse = await axios.post(`${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions`, newVersionData)
    
    // Update MediaPlanMaster with new version number and campaign name
    const masterUpdateData = {
      version_number: nextVersionNumber,
      mp_campaignname: data.mp_campaignname || masterData.mp_campaignname,
      campaign_status: data.mp_campaignstatus || masterData.campaign_status,
      campaign_start_date: normalizedCampaignStartDate,
      campaign_end_date: normalizedCampaignEndDate,
      mp_campaignbudget: data.mp_campaignbudget || masterData.mp_campaignbudget
    }
    
    const masterUpdateResponse = await axios.patch(`${MEDIA_PLAN_MASTER_URL}/media_plan_master/${masterData.id}`, masterUpdateData)
    
    console.log("New version created:", versionResponse.data)
    console.log("Master updated:", masterUpdateResponse.data)
    
    return NextResponse.json({
      version: versionResponse.data,
      master: masterUpdateResponse.data,
      latestVersionNumber,
      nextVersionNumber
    })
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

// PATCH (update) media plan master by MBA number
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number } = await params
    const data = await request.json()
    
    console.log(`[PATCH] Updating media plan master for MBA: "${mba_number}"`)
    console.log(`[PATCH] MBA number type: ${typeof mba_number}, length: ${mba_number?.length}`)
    console.log("[PATCH] Update data:", data)
    
    // First, get the MediaPlanMaster by MBA number (require exact match)
    const masterQueryUrl = `${MEDIA_PLAN_MASTER_URL}/media_plan_master?mba_number=${encodeURIComponent(mba_number)}`
    console.log(`[PATCH] Querying master with URL: ${masterQueryUrl}`)
    
    const masterResponse = await axios.get(masterQueryUrl)
    
    const normalize = (value: any) => String(value ?? '').trim().toLowerCase()
    const requestedNormalized = normalize(mba_number)
    
    // Handle array response - find the exact match (same logic as GET handler)
    let masterData: any = null
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => normalize(item?.mba_number) === requestedNormalized) || null
    } else if (masterResponse.data && typeof masterResponse.data === 'object') {
      const candidate = masterResponse.data as any
      masterData = normalize(candidate?.mba_number) === requestedNormalized ? candidate : null
    }
    
    console.log(`[PATCH] Master data response:`, {
      found: !!masterData,
      id: masterData?.id,
      mbaNumber: masterData?.mba_number,
      versionNumber: masterData?.version_number
    })
    
    // Validate that we got the correct MBA number
    if (masterData && masterData.mba_number !== mba_number) {
      console.error(`[PATCH] MBA number mismatch! Requested: "${mba_number}", Got: "${masterData.mba_number}"`)
      return NextResponse.json(
        { 
          error: `MBA number mismatch: requested "${mba_number}" but received data for "${masterData.mba_number}". This indicates a database query issue.`,
          requestedMbaNumber: mba_number,
          receivedMbaNumber: masterData.mba_number
        },
        { status: 500 }
      )
    }
    
    if (!masterData) {
      console.error(`[PATCH] Master not found for MBA: ${mba_number}`)
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 }
      )
    }
    
    console.log(`[PATCH] Successfully found master data for MBA: ${mba_number}`)

    // Validate that we have the id field (required for PATCH)
    if (!masterData.id) {
      console.error(`[PATCH] Master data missing id field:`, masterData)
      return NextResponse.json(
        { error: `Media plan master data is missing the required 'id' field` },
        { status: 500 }
      )
    }

    const masterId = masterData.id
    console.log(`[PATCH] Using master ID for update: ${masterId} (type: ${typeof masterId})`)
    
    // Ensure masterId is a number (Xano requires numeric ID)
    const numericMasterId = typeof masterId === 'number' ? masterId : parseInt(masterId, 10)
    if (isNaN(numericMasterId)) {
      console.error(`[PATCH] Invalid master ID: ${masterId}`)
      return NextResponse.json(
        { error: `Invalid master ID format: ${masterId}. Expected numeric ID.` },
        { status: 400 }
      )
    }

    // Build update data object with only provided fields
    // IMPORTANT: Do NOT include id, mba_number, or other identifying fields in the update payload
    // Only include fields that should be updated to avoid bulk updates
    const masterUpdateData: any = {}
    
    if (data.version_number !== undefined) {
      masterUpdateData.version_number = data.version_number
    }
    if (data.mp_campaignname !== undefined) {
      masterUpdateData.mp_campaignname = data.mp_campaignname
    }
    if (data.campaign_status !== undefined) {
      masterUpdateData.campaign_status = data.campaign_status
    }
    if (data.campaign_start_date !== undefined) {
      masterUpdateData.campaign_start_date = data.campaign_start_date
        ? toMelbourneDateString(data.campaign_start_date)
        : data.campaign_start_date
    }
    if (data.campaign_end_date !== undefined) {
      masterUpdateData.campaign_end_date = data.campaign_end_date
        ? toMelbourneDateString(data.campaign_end_date)
        : data.campaign_end_date
    }
    if (data.mp_campaignbudget !== undefined) {
      masterUpdateData.mp_campaignbudget = data.mp_campaignbudget
    }
    
    // Construct the PATCH URL using the numeric id field
    // Format: /media_plan_master/{id} - this should target ONLY the specific record
    const patchUrl = `${MEDIA_PLAN_MASTER_URL}/media_plan_master/${numericMasterId}`
    console.log(`[PATCH] Updating media plan master at URL: ${patchUrl}`)
    console.log(`[PATCH] Target master ID: ${numericMasterId}`)
    console.log(`[PATCH] Update payload (only updating these fields):`, masterUpdateData)
    console.log(`[PATCH] Payload keys:`, Object.keys(masterUpdateData))
    
    // Verify we're not accidentally including identifying fields that could cause bulk updates
    if (masterUpdateData.id || masterUpdateData.mba_number) {
      console.error(`[PATCH] ERROR: Update payload contains identifying fields that could cause bulk updates!`, masterUpdateData)
      return NextResponse.json(
        { error: `Update payload must not contain id or mba_number fields to prevent bulk updates` },
        { status: 400 }
      )
    }
    
    // Update MediaPlanMaster using the id field in the URL path
    // This should update ONLY the record with the matching ID
    const masterUpdateResponse = await axios.patch(
      patchUrl, 
      masterUpdateData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    
    // Check if the update was successful
    if (masterUpdateResponse.status >= 200 && masterUpdateResponse.status < 300) {
      console.log(`[PATCH] Successfully updated master ID ${numericMasterId}`)
      console.log("[PATCH] Master updated response:", masterUpdateResponse.data)
      
      // Verify the response indicates a single record was updated
      // Xano typically returns the updated record object, not an array
      if (Array.isArray(masterUpdateResponse.data)) {
        console.warn(`[PATCH] WARNING: Response is an array. Expected single record object. Array length: ${masterUpdateResponse.data.length}`)
        if (masterUpdateResponse.data.length > 1) {
          console.error(`[PATCH] ERROR: Multiple records returned! This suggests bulk update occurred.`)
        }
      }
      
      return NextResponse.json(masterUpdateResponse.data)
    } else {
      console.error(`[PATCH] Unexpected response status: ${masterUpdateResponse.status}`)
      return NextResponse.json(
        { 
          error: `Failed to update media plan master: Unexpected status ${masterUpdateResponse.status}`,
          details: masterUpdateResponse.data
        },
        { status: masterUpdateResponse.status }
      )
    }
  } catch (error) {
    console.error("Error updating media plan master:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
      })
      
      return NextResponse.json(
        { 
          error: `Failed to update media plan master: ${error.response?.data?.message || error.message}`,
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
        error: "Failed to update media plan master", 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

