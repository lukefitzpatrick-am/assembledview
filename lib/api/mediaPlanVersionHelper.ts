import axios from 'axios';

const MEDIA_PLANS_VERSIONS_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa";
const MEDIA_PLAN_MASTER_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa";

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
    const masterResponse = await axios.get(`${MEDIA_PLAN_MASTER_URL}/media_plan_master?mba_number=${encodeURIComponent(mbaNumber)}`);
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
      `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?media_plan_master_id=${masterData.id}&version_number=${masterData.version_number}`
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
  // Normalize version number for comparison (handle both string and number)
  const normalizedVersionNumber = typeof versionNumber === 'string' 
    ? parseInt(versionNumber, 10) 
    : versionNumber
  
  const filteredData = data.filter((item: any) => {
    // Normalize values for comparison (handle both string and number)
    const itemMba = String(item.mba_number || '').trim();
    const filterMba = String(mbaNumber).trim();
    
    // Check both version_number and mp_plannumber fields
    const itemVersion = typeof item.version_number === 'string' 
      ? parseInt(item.version_number, 10) 
      : (item.version_number || null)
    const itemPlan = typeof item.mp_plannumber === 'string'
      ? parseInt(item.mp_plannumber, 10)
      : (item.mp_plannumber || null)
    
    const matchesMba = itemMba === filterMba;
    // Match if EITHER version_number OR mp_plannumber matches the requested version
    const matchesVersion = (itemVersion !== null && itemVersion === normalizedVersionNumber) ||
                           (itemPlan !== null && itemPlan === normalizedVersionNumber);
    
    if (!matchesMba || !matchesVersion) {
      console.log(`[${mediaType}] Filtered out item: mba_number=${itemMba} (expected ${filterMba}), version_number=${itemVersion}, mp_plannumber=${itemPlan} (expected ${normalizedVersionNumber})`);
    }
    
    // Must match BOTH mba_number AND (version_number OR mp_plannumber)
    return matchesMba && matchesVersion;
  });
  
  if (filteredData.length !== data.length) {
    console.warn(`[${mediaType}] Warning: ${data.length - filteredData.length} items were filtered out. Only items matching both mba_number and (version_number OR mp_plannumber) are returned.`);
    console.log(`[${mediaType}] Kept ${filteredData.length} items matching mba_number=${mbaNumber} and version=${normalizedVersionNumber}`);
  }
  
  return filteredData;
}



























