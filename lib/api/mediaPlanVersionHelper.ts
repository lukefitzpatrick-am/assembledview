import axios from 'axios';
import { xanoUrl } from '@/lib/api/xano';
import { sortLineItemsByLineItemNumber } from '@/lib/mediaplan/lineItemIds';

/**
 * Gets the version_number from media_plan_versions table for a given mba_number
 * This ensures we use the correct version_number that matches the mp_plannumber
 */
export async function getVersionNumberForMBA(
  mbaNumber: string,
  mpPlanNumber?: string | null,
  mediaPlanVersion?: string | null
): Promise<string | null> {
  const normalize = (value: any) => String(value ?? '').trim().toLowerCase()
  const requestedNormalized = normalize(mbaNumber)
  
  // If mp_plannumber is provided directly, use it
  if (mpPlanNumber) {
    return mpPlanNumber;
  }
  
  // If media_plan_version is provided, use it
  if (mediaPlanVersion) {
    return mediaPlanVersion;
  }
  
  // Need to fetch the latest version_number from media_plan_versions table
  try {
    // First get the master data to find the latest version number
    const masterResponse = await axios.get(
      `${xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?mba_number=${encodeURIComponent(mbaNumber)}`
    );
    let masterData: any = null;
    
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => normalize(item?.mba_number) === requestedNormalized) || null;
    } else if (masterResponse.data && typeof masterResponse.data === 'object') {
      masterData = normalize((masterResponse.data as any).mba_number) === requestedNormalized
        ? masterResponse.data
        : null;
    }
    
    if (!masterData) {
      throw new Error(`Media plan master not found for MBA number ${mbaNumber}`);
    }
    
    if (masterData.version_number === undefined || masterData.version_number === null) {
      throw new Error(`Media plan master for MBA ${mbaNumber} is missing version_number`);
    }
    
    // Get the specific version data
    const versionResponse = await axios.get(
      `${xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}?media_plan_master_id=${masterData.id}&version_number=${masterData.version_number}`
    );
    
    let versionData: any = null;
    if (Array.isArray(versionResponse.data)) {
      versionData = versionResponse.data.find((item: any) => 
        item.media_plan_master_id === masterData.id && 
        item.version_number === masterData.version_number
      );
    } else {
      versionData = versionResponse.data;
    }
    
    if (versionData && versionData.version_number !== undefined && versionData.version_number !== null) {
      return String(versionData.version_number);
    }
    
    // Fallback to the master's version_number if versionData is missing the field
    return String(masterData.version_number);
  } catch (error) {
    console.error(`Error fetching version number from media_plan_versions for MBA ${mbaNumber}:`, error);
    throw error;
  }
  
  return null;
}

/**
 * Filters line items to ensure they match both mba_number AND (version_number OR mp_plannumber)
 * This ensures we check ALL entries and match items regardless of which version field is used
 */
export function filterLineItemsByPlanNumber(
  data: any[],
  mbaNumber: string,
  versionNumber: string,
  mediaType: string
): any[] {
  const requestedVersion = String(versionNumber ?? "").trim()
  const requestedMba = String(mbaNumber ?? "").trim()

  // Normalize version number for comparison (handle both string and number)
  const filteredData = data.filter((item: any) => {
    const itemMba = String(item.mba_number ?? item.mbaNumber ?? "").trim()

    const versionCandidates = [
      item.media_plan_version,
      item.media_plan_version_number,
      item.version_number,
      item.versionNumber,
      item.mp_plannumber,
      item.mp_plan_number,
    ]

    const versionMatch = versionCandidates.some((value) => String(value ?? "").trim() === requestedVersion)
    const mbaMatch = itemMba === requestedMba

    return versionMatch && mbaMatch
  })

  if (filteredData.length !== data.length) {
    // Avoid per-item log spam when callers accidentally over-fetch many historic versions.
    console.warn(
      `[${mediaType}] Warning: ${data.length - filteredData.length} items were filtered out. Only items matching both mba_number and version are returned.`
    )
    console.log(
      `[${mediaType}] Kept ${filteredData.length} items matching mba_number=${requestedMba} and version=${requestedVersion}`
    )
  }

  return sortLineItemsByLineItemNumber(filteredData);
}



























