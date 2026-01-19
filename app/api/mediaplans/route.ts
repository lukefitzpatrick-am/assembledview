import { NextResponse } from "next/server"
import axios from "axios"
import { toMelbourneDateString } from "@/lib/timezone"
import { xanoUrl } from "@/lib/api/xano"

export async function POST(request: Request) {
  try {
    // For now, allow access for development
    // In production, you would validate the Auth0 session here
    
    const data = await request.json()
    
    // First, create MediaPlanMaster record
    // For new media plans, version_number is always set to 1
    const mediaPlanMasterData = {
      mp_client_name: data.mp_client_name,
      mba_number: data.mbanumber,
      mp_campaignname: data.mp_campaignname,
      version_number: 1, // Always 1 for new media plans created from create page
      campaign_status: data.mp_campaignstatus || "Draft",
      campaign_start_date: data.mp_campaigndates_start ? toMelbourneDateString(data.mp_campaigndates_start) : data.mp_campaigndates_start,
      campaign_end_date: data.mp_campaigndates_end ? toMelbourneDateString(data.mp_campaigndates_end) : data.mp_campaigndates_end,
      mp_campaignbudget: data.mp_campaignbudget
    }

    // Create MediaPlanMaster
    const masterResponse = await axios.post(
      xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
      mediaPlanMasterData
    )
    
    // Note: Version creation is handled separately by handleSaveMediaPlanVersion 
    // which includes all fields (brand, client_contact, po_number, mediatype flags, billing schedule)
    // This prevents duplicate entries with incomplete data
    
    return NextResponse.json({
      master: masterResponse.data
    })
  } catch (error) {
    console.error("Failed to create media plan:", error);
    
    // Provide more detailed error information
    let errorMessage = "Failed to create media plan";
    let statusCode = 500;
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      // Extract error message from Xano response
      const xanoError = error.response?.data?.error || error.response?.data?.message;
      errorMessage = xanoError || error.message || "Failed to create media plan";
      statusCode = error.response?.status || 500;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

export async function GET() {
  try {
    // For now, allow access for development
    // In production, you would validate the Auth0 session here
    
    // Fetch from MediaPlanVersions to get the latest versions with media type flags
    try {
      // Fetch both media_plan_versions and media_plan_master in parallel
      const [versionsResponse, masterResponse] = await Promise.all([
        axios.get(xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])),
        axios.get(xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]))
      ])
      
      const versionsData = versionsResponse.data
      const mastersData = Array.isArray(masterResponse.data) ? masterResponse.data : [masterResponse.data]
      
      console.log("MediaPlanVersions response:", versionsData)
      console.log("MediaPlanMaster response:", mastersData)
      
      // Create a map of mba_number -> master data for quick lookup
      const masterMap = new Map<string, any>()
      mastersData.forEach((master: any) => {
        if (master.mba_number) {
          masterMap.set(master.mba_number, master)
        }
      })
      
      // Find the latest version for each unique MBA number from media_plan_versions
      // Group by mba_number and keep only the entry with the highest version_number
      const latestVersionsFromVersions = Object.values(
        (Array.isArray(versionsData) ? versionsData : [versionsData]).reduce((acc: Record<string, any>, plan: any) => {
          const mbaNumber = plan.mba_number;
          if (!mbaNumber) {
            // Skip plans without an MBA number
            return acc;
          }
          if (!acc[mbaNumber] || acc[mbaNumber].version_number < plan.version_number) {
            acc[mbaNumber] = plan;
          }
          return acc;
        }, {} as Record<string, any>)
      );

      // Now merge with master data to get the correct version_number from media_plan_master
      // Use version_number from media_plan_master as the source of truth
      const mergedData = latestVersionsFromVersions.map((versionPlan: any) => {
        const masterData = masterMap.get(versionPlan.mba_number)
        if (masterData && masterData.version_number !== undefined) {
          // Override version_number with the one from media_plan_master
          return {
            ...versionPlan,
            version_number: masterData.version_number // Use version_number from master, NOT from versions table
          }
        }
        // If no master found, keep the version from versions table (fallback)
        console.warn(`No master data found for MBA ${versionPlan.mba_number}, using version_number from versions table`)
        return versionPlan
      })

      console.log("Merged data with version_number from media_plan_master:", mergedData)
      return NextResponse.json(mergedData)
    } catch (versionsError) {
      console.log("MediaPlanVersions failed, trying original endpoint:", versionsError.message)
      
      // Fallback to the original working endpoint
      // Use version_number from media_plan_master as the source of truth
      try {
        // Fetch master data to get correct version numbers
        let masterMap = new Map<string, any>()
        try {
          const masterResponse = await axios.get(
            xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
          )
          const masters = Array.isArray(masterResponse.data) ? masterResponse.data : [masterResponse.data]
          masters.forEach((master: any) => {
            if (master.mba_number) {
              masterMap.set(master.mba_number, master)
            }
          })
        } catch (masterError) {
          console.log("Could not fetch masters for version number:", masterError)
        }
        
        // get_mediaplan_topline expects version_number in the request body as a POST request
        // Use a reasonable default, but we'll override with master version_number after
        let latestVersionId = 1; // Default fallback
        if (masterMap.size > 0) {
          const maxVersion = Math.max(...Array.from(masterMap.values()).map((m: any) => m.version_number || 1))
          latestVersionId = maxVersion
        }
        
        const originalResponse = await axios.post(
          xanoUrl("get_mediaplan_topline", "XANO_MEDIAPLANS_BASE_URL"),
          { version_number: latestVersionId }
        )
        console.log("Original endpoint response:", originalResponse.data)
        
        // Apply the same filtering: group by mba_number and keep only highest version
        const fallbackData = Array.isArray(originalResponse.data) ? originalResponse.data : [originalResponse.data];
        const filteredFallbackData = Object.values(
          fallbackData.reduce((acc: Record<string, any>, plan: any) => {
            const mbaNumber = plan.mba_number;
            if (!mbaNumber) {
              // Skip plans without an MBA number
              return acc;
            }
            if (!acc[mbaNumber] || acc[mbaNumber].version_number < plan.version_number) {
              acc[mbaNumber] = plan;
            }
            return acc;
          }, {} as Record<string, any>)
        );
        
        // Override version_number with the one from media_plan_master
        const mergedFallbackData = filteredFallbackData.map((plan: any) => {
          const masterData = masterMap.get(plan.mba_number)
          if (masterData && masterData.version_number !== undefined) {
            return {
              ...plan,
              version_number: masterData.version_number // Use version_number from master
            }
          }
          return plan
        })
        
        return NextResponse.json(mergedFallbackData)
      } catch (fallbackError) {
        console.error("Fallback endpoint also failed:", fallbackError)
        // Re-throw the original error since fallback also failed
        throw versionsError
      }
    }
  } catch (error) {
    console.error("Failed to fetch media plans:", error);
    
    // Provide more detailed error information
    let errorMessage = "Failed to fetch media plans";
    let statusCode = 500;
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      errorMessage = error.response?.data?.message || error.message || "Failed to fetch media plans";
      statusCode = error.response?.status || 500;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

