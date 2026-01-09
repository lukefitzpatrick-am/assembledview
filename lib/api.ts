import { toMelbourneDateString } from "@/lib/timezone"

const PUBLISHERS_BASE_URL = process.env.XANO_PUBLISHERS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:YkRK8qLP"
const CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const MEDIA_DETAILS_BASE_URL = process.env.XANO_MEDIA_DETAILS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:di-s-JRc" 
const MEDIA_PLANS_BASE_URL = process.env.XANO_MEDIA_PLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
const XANO_API_KEY = process.env.XANO_API_KEY || ""

// Media Plan Line Item Interfaces based on provided schemas
interface CinemaLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  network: string;
  buy_type: string;
  format: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  line_item: number;
  station: string;
  placement: string;
  duration: string;
  bursts: any; // JSON field
  bid_strategy: string;
}

interface DigitalAudioLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  publisher: string;
  site: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface BVODLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  publisher: string;
  site: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface DigitalDisplayLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  publisher: string;
  site: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface DigitalVideoLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  publisher: string;
  site: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

// Production / Consulting
export interface ProductionLineItem {
  id?: number;
  created_at?: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  media_type: string;
  publisher: string;
  description: string;
  market?: string;
  line_item_id: string;
  bursts_json: any;
  line_item: number;
}

interface MagazinesLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  network: string;
  title: string;
  buy_type: string;
  size: string;
  format: string;
  placement: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface NewspaperLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  network: string;
  title: string;
  buy_type: string;
  size: string;
  format: string;
  placement: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface OOHLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  network: string;
  format: string;
  buy_type: string;
  type: string;
  placement: string;
  size: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface ProgAudioLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface ProgBVODLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface ProgDisplayLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface ProgOOHLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface ProgVideoLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface RadioLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  network: string;
  station: string;
  platform?: string;
  bid_strategy: string;
  buy_type: string;
  placement: string;
  format: string;
  duration: string;
  creative_targeting?: string;
  creative?: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts: any; // JSON field - matches database schema
  line_item: number;
}

interface SearchLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface SocialMediaLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface IntegrationLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  creative: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  line_item_id: string;
  bursts_json: any; // JSON field
  line_item: number;
}

interface InfluencersLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  platform: string;
  objective: string;
  campaign: string;
  buy_type: string;
  targeting_attribute: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  no_adserving: boolean;
  bursts_json: any; // JSON field
  line_item: number;
}

interface TelevisionLineItem {
  id: number;
  created_at: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  market: string;
  network: string;
  station: string;
  daypart: string;
  placement: string;
  buy_type: string;
  buying_demo: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  line_item_id: string;
  creative: string;
  bursts_json: any; // JSON field
  line_item: number;
}



interface MediaPlan {
  mp_client_name: string;
  mp_campaignname: string;
  mba_number: string;
  version_number: number;
}

// Replace the old MediaPlanVersion interface with this one
interface MediaPlanVersion {
  media_plan_master_id: number;
  version_number: number;
  mba_number: string;
  campaign_name: string;
  campaign_status: string;
  campaign_start_date: string;
  campaign_end_date: string;
  brand: string;
  client_name: string;
  client_contact: string;
  po_number: string;
  mp_campaignbudget: number;
  fixed_fee: boolean;
  mp_television: boolean;
  mp_radio: boolean;
  mp_newspaper: boolean;
  mp_magazines: boolean;
  mp_ooh: boolean;
  mp_cinema: boolean;
  mp_digidisplay: boolean;
  mp_digiaudio: boolean;
  mp_digivideo: boolean;
  mp_bvod: boolean;
  mp_integration: boolean;
  mp_search: boolean;
  mp_socialmedia: boolean;
  mp_progdisplay: boolean;
  mp_progvideo: boolean;
  mp_progbvod: boolean;
  mp_progaudio: boolean;
  mp_progooh: boolean;
  mp_influencers: boolean;
  billingSchedule?: any;
  deliverySchedule?: any;
  created_at?: number;
}

interface Publisher {
  id: number;
  publisher_name: string;
}

interface ClientInfo {
  id: string;
  name: string;
  feesearch: number;
  payment_days: number;
  payment_terms: string;
  brand_colour: string;
}

interface TVStation {
  id: number;
  station: string;
  network: string;
}

interface RadioStation {
  id: number;
  station: string;
  network: string;
}

interface Newspapers {
  id: number;
  title: string;
  network: string;
}

interface NewspapersAdSizes {
  id: number;
  adsize: string;
}

interface Magazines {
  id: number;
  title: string;
  network: string;
}

interface MagazinesAdSizes {
  id: number;
  adsize: string;
}

interface AudioSite {
  id: number;
  platform: string;
  site: string;
}

interface VideoSite {
  id: number;
  platform: string;
  site: string;
}

interface DisplaySite {
  id: number;
  platform: string;
  site: string;
}

interface BVODSite {
  id: number;
  platform: string;
  site: string;
}

interface RadioLineItems {
  media_plan_version: number;
   mba_number: string;
   mp_client_name: string;
   mp_plannumber: string;
   network: string;
   station: string;
   buy_type: string;
   placement: string;
   format: string;
   duration: string;
   buying_demo: string;
   market: string;
   budget: number;
   buy_amount: number;
   start_date: string;
   end_date: string;
   fixed_cost_media: boolean;
   client_pays_for_media: boolean;
   budget_includes_fees: boolean;
   bursts?: any; 
 }


export async function createMediaPlan(data: { 
  mp_client_name: string; 
  mp_campaignname: string; 
  mba_number: string;
  mp_campaigndates_start: Date;
  mp_campaigndates_end: Date;
  mp_campaignstatus: string;
  mp_campaignbudget: number;
  mp_plannumber: string;
}) {
  try {
    const response = await fetch('/api/mediaplans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mp_client_name: data.mp_client_name,
        mp_campaignname: data.mp_campaignname,
        mbanumber: data.mba_number,
        mp_campaigndates_start: toMelbourneDateString(data.mp_campaigndates_start),
        mp_campaigndates_end: toMelbourneDateString(data.mp_campaigndates_end),
        mp_campaignstatus: data.mp_campaignstatus,
        mp_campaignbudget: data.mp_campaignbudget,
        mp_plannumber: data.mp_plannumber,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.message || "Failed to create media plan");
    }
    const result = await response.json();
    // Return the master data with id for compatibility
    return { id: result.master.id };
  } catch (error) {
    console.error("Error creating media plan:", error);
    throw error;
  }
}

/**
 * Creates a new media plan version in Xano.
 * 
 * IMPORTANT: The Xano endpoint must have an 'input' block that explicitly declares all input fields.
 * The Xano script should look like:
 * 
 * query media_plan_versions verb=POST {
 *   input {
 *     media_plan_master_id: integer
 *     version_number: integer
 *     mba_number: string
 *     campaign_name: string
 *     campaign_status: string
 *     campaign_start_date: datetime
 *     campaign_end_date: datetime
 *     brand: string
 *     client_name: string  // Required - maps to mp_client_name in database
 *     client_contact: string
 *     po_number: string
 *     mp_campaignbudget: number
 *     fixed_fee: boolean
 *     // ... all other boolean media type flags ...
 *     billingSchedule: json
 *     created_at: integer
 *   }
 *   stack {
 *     db.add media_plan_versions {
 *       data = {
 *         mp_client_name: $input.client_name
 *         // ... other field mappings ...
 *       }
 *     }
 *   }
 * }
 * 
 * Note: If the input block only contains 'dblink', Xano will not parse the JSON body fields.
 */
export async function createMediaPlanVersion(data: MediaPlanVersion) {
  try {
    // Ensure client_name is always a non-empty string
    if (!data.client_name || typeof data.client_name !== 'string' || data.client_name.trim() === '') {
      throw new Error("client_name is required and must be a non-empty string");
    }
    
    // Validate required fields match Xano expectations
    const requiredFields = {
      media_plan_master_id: 'number',
      version_number: 'number',
      mba_number: 'string',
      campaign_name: 'string',
      campaign_status: 'string',
      campaign_start_date: 'string',
      campaign_end_date: 'string',
      brand: 'string',
      client_name: 'string',
      client_contact: 'string',
      po_number: 'string',
      mp_campaignbudget: 'number',
    };
    
    const missingFields: string[] = [];
    const typeMismatches: string[] = [];
    
    Object.entries(requiredFields).forEach(([field, expectedType]) => {
      if (data[field as keyof MediaPlanVersion] === undefined || data[field as keyof MediaPlanVersion] === null) {
        missingFields.push(field);
      } else if (typeof data[field as keyof MediaPlanVersion] !== expectedType) {
        typeMismatches.push(`${field} (expected ${expectedType}, got ${typeof data[field as keyof MediaPlanVersion]})`);
      }
    });
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    if (typeMismatches.length > 0) {
      console.warn("Type mismatches detected:", typeMismatches);
    }
    
    // Ensure boolean fields are actual booleans (not strings or undefined)
    const booleanFields = [
      'fixed_fee', 'mp_television', 'mp_radio', 'mp_newspaper', 'mp_magazines',
      'mp_ooh', 'mp_cinema', 'mp_digidisplay', 'mp_digiaudio', 'mp_digivideo',
      'mp_bvod', 'mp_integration', 'mp_search', 'mp_socialmedia', 'mp_progdisplay',
      'mp_progvideo', 'mp_progbvod', 'mp_progaudio', 'mp_progooh', 'mp_influencers'
    ];
    
    const sanitizedData: Partial<MediaPlanVersion> = { ...data };
    if (sanitizedData.deliverySchedule && !(sanitizedData as any).delivery_schedule) {
      (sanitizedData as any).delivery_schedule = sanitizedData.deliverySchedule;
    }
    booleanFields.forEach(field => {
      if (sanitizedData[field as keyof MediaPlanVersion] === undefined) {
        (sanitizedData as any)[field] = false;
      }
    });
    
    // Log the payload for debugging
    console.log("Creating media plan version with payload:", JSON.stringify(sanitizedData, null, 2));
    console.log("client_name value:", sanitizedData.client_name);
    console.log("client_name type:", typeof sanitizedData.client_name);
    
    const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(sanitizedData), 
    });
    
    if (!response.ok) {
      let errorMessage = "Failed to create media plan version";
      let errorData: any = {};
      
      try {
        const responseText = await response.text();
        console.error("Raw error response:", responseText);
        
        if (responseText) {
          try {
            errorData = JSON.parse(responseText);
          } catch (parseError) {
            // If response is not JSON, use the text as error message
            errorMessage = responseText || `HTTP ${response.status}: ${response.statusText}`;
          }
        }
      } catch (textError) {
        console.error("Error reading error response:", textError);
      }
      
      console.error("API Error Response:", errorData);
      console.error("Request payload that failed:", JSON.stringify(sanitizedData, null, 2));
      console.error("Response status:", response.status);
      console.error("Response headers:", Object.fromEntries(response.headers.entries()));
      
      // Extract error message from various possible locations
      errorMessage = errorData.message || errorData.error || errorData.detail || errorMessage;
      
      // Check if the error mentions "Unable to locate input" - this suggests Xano can't find the field
      if (errorMessage.includes("Unable to locate input") || errorMessage.includes("client_name")) {
        const missingField = errorMessage.match(/Unable to locate input: (\w+)/)?.[1] || "unknown field";
        console.error("Xano query error detected. The endpoint input block needs to explicitly declare input fields.");
        console.error(`Missing field in Xano script: ${missingField}`);
        console.error("Payload structure:", {
          hasClientName: !!sanitizedData.client_name,
          clientNameValue: sanitizedData.client_name,
          clientNameType: typeof sanitizedData.client_name,
          allKeys: Object.keys(sanitizedData),
          payloadKeys: Object.keys(sanitizedData).sort(),
          expectedKeys: [
            'media_plan_master_id', 'version_number', 'mba_number', 'campaign_name',
            'campaign_status', 'campaign_start_date', 'campaign_end_date', 'brand',
            'client_name', 'client_contact', 'po_number', 'mp_campaignbudget',
            'fixed_fee', 'mp_television', 'mp_radio', 'mp_newspaper', 'mp_magazines',
            'mp_ooh', 'mp_cinema', 'mp_digidisplay', 'mp_digiaudio', 'mp_digivideo',
            'mp_bvod', 'mp_integration', 'mp_search', 'mp_socialmedia', 'mp_progdisplay',
            'mp_progvideo', 'mp_progbvod', 'mp_progaudio', 'mp_progooh', 'mp_influencers',
            'billingSchedule', 'created_at'
          ].sort()
        });
        console.error("Xano Script Fix Required:");
        console.error("The Xano script's 'input' block must explicitly declare all input fields.");
        console.error("Example: input { client_name: string, media_plan_master_id: integer, ... }");
        console.error("Remove or modify the 'dblink' configuration in the input block if it's preventing field parsing.");
        
        // Provide a more helpful error message
        errorMessage = `Xano endpoint configuration error: The input field '${missingField}' is not declared in the Xano script's input block. Please update the Xano script to explicitly declare all input fields (client_name, media_plan_master_id, etc.) in the input block.`;
      }
      
      // If we got an empty object but status is 500, provide a more helpful message
      if (response.status === 500 && (!errorData.message && !errorData.error)) {
        errorMessage = "Server error: Unable to process request. Please check that all required fields are provided correctly.";
      }
      
      throw new Error(errorMessage);
    }
    
    const responseText = await response.text();
    if (!responseText) {
      throw new Error("Empty response from server");
    }
    
    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse response as JSON:", responseText);
      throw new Error("Invalid response format from server");
    }
  } catch (error) {
    console.error("Error creating media plan version:", error);
    throw error;
  }
}

export async function editMediaPlan(id: number, data: any) { 
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan/${id}`, { 
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to edit media plan");
  }
  return response.json();
}

export async function getPublishers(): Promise<Publisher[]> {
  const res = await fetch('/api/publishers')
  if (!res.ok) throw new Error('Failed to fetch publishers')
  return res.json()
}

export async function getMediaPlanVersions() {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_versions`);
  if (!response.ok) {
    throw new Error("Failed to fetch media plan versions");
  }
  return response.json();
}

export async function getMediaPlanVersionById(id: number) {
  try {
    const response = await fetch(`https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa/media_plan_versions?id=${id}`);
    if (!response.ok) {
      throw new Error("Failed to fetch media plan version");
    }
    const data = await response.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    console.error("Error fetching media plan version:", error);
    throw error;
  }
}

export async function getMediaPlanVersionByMasterId(masterId: number) {
  try {
    const response = await fetch(`https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa/media_plan_versions?media_plan_master_id=${masterId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch media plan versions by master ID");
    }
    const data = await response.json();
    
    // Get the latest version (highest version_number)
    if (Array.isArray(data) && data.length > 0) {
      return data.reduce((latest, current) => 
        current.version_number > latest.version_number ? current : latest
      );
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching media plan versions by master ID:", error);
    throw error;
  }
}





export async function getMediaPlanByMBA(mba_number: string) {
  return fetch(`/media_plan?mba_number=${mba_number}`);
}
export async function getMediaPlanVersionByMBA(mba_number: string) {
  return fetch(`/media_plan_version?mba_number=${mba_number}`);
}

export async function getTVStations(): Promise<TVStation[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/tv_stations`);
  if (!response.ok) {
    throw new Error("Failed to fetch TV stations");
  }
  return response.json();
}

export async function getRadioStations(): Promise<RadioStation[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/radio_stations`);
  if (!response.ok) {
    throw new Error("Failed to fetch TV stations");
  }
  return response.json();
}

export async function getNewspapers(): Promise<Newspapers[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/newspapers`);
  if (!response.ok) {
    throw new Error("Failed to fetch newspapers");
  }
  return response.json();
}

export async function getNewspapersAdSizes(): Promise<NewspapersAdSizes[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/newspaper_adsizes`);
  if (!response.ok) {
    throw new Error("Failed to fetch newspapers ad sizes");
  }
  return response.json();
}

export async function getMagazines(): Promise<Magazines[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/magazines`);
  if (!response.ok) {
    throw new Error("Failed to fetch magazines");
  }
  return response.json();
}

export async function getMagazinesAdSizes(): Promise<MagazinesAdSizes[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/magazines_adsizes`);
  if (!response.ok) {
    throw new Error("Failed to fetch magazines ad sizes");
  }
  return response.json();
}

export async function getAudioSites(): Promise<AudioSite[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/audio_site`);
  if (!response.ok) {
    throw new Error("Failed to fetch audio sites");
  }
  return response.json();
}

export async function getVideoSites(): Promise<VideoSite[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/video_site`);
  if (!response.ok) {
    throw new Error("Failed to fetch video sites");
  }
  return response.json();
}

export async function getDisplaySites(): Promise<DisplaySite[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/display_site`);
  if (!response.ok) {
    throw new Error("Failed to fetch display sites");
  }
  return response.json();
}

export async function getBVODSites(): Promise<BVODSite[]> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/bvod_site`);
  if (!response.ok) {
    throw new Error("Failed to fetch BVOD sites");
  }
  return response.json();
}



export async function createTVStation(stationData: { station: string; network: string }): Promise<TVStation> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/POST_tv_stations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(stationData),
  });
  if (!response.ok) {
    throw new Error("Failed to create TV Station");
  }
  return response.json();
}

export async function createRadioStation(stationData: { station: string; network: string }): Promise<RadioStation> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/POST_radio_stations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(stationData),
  });
  if (!response.ok) {
    throw new Error("Failed to create TV Station");
  }
  return response.json();
}

export async function createNewspaper(newspaperData: { title: string; network: string }): Promise<Newspapers> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/POST_newspapers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newspaperData),
  });
  if (!response.ok) {
    throw new Error("Failed to create Newspaper");
  }
  return response.json();
}

export async function createNewspaperAdSize(adSizeData: { adsize: string }): Promise<NewspapersAdSizes> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/POST_newspaper_adsizes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(adSizeData),
  });
  if (!response.ok) {
    throw new Error("Failed to create Newspaper Ad Size");
  }
  return response.json();
}

export async function createMagazine(magazineData: { title: string; network: string }): Promise<Magazines> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/POST_magazines`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(magazineData),
  });
  if (!response.ok) {
    throw new Error("Failed to create Magazine");
  }
  return response.json();
}

export async function createMagazineAdSize(adSizeData: { adsize: string }): Promise<MagazinesAdSizes> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/POST_magazines_adsizes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(adSizeData),
  });
  if (!response.ok) {
    throw new Error("Failed to create Magazine Ad Size");
  }
  return response.json();
}

export async function createAudioSite(siteData: { platform: string; site: string }): Promise<AudioSite> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/audio_site`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(siteData),
  });
  if (!response.ok) {
    throw new Error("Failed to create Audio Site");
  }
  return response.json();
}

export async function createVideoSite(siteData: { platform: string; site: string }): Promise<VideoSite> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/video_site`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(siteData),
  });
  if (!response.ok) {
    throw new Error("Failed to create Video Site");
  }
  return response.json();
}

export async function createDisplaySite(siteData: { platform: string; site: string }): Promise<DisplaySite> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/display_site`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(siteData),
  });
  if (!response.ok) {
    throw new Error("Failed to create Display Site");
  }
  return response.json();
}

export async function createBVODSite(siteData: { platform: string; site: string }): Promise<BVODSite> {
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/bvod_site`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(siteData),
  });
  if (!response.ok) {
    throw new Error("Failed to create BVOD Site");
  }
  return response.json();
}

export async function getPublishersForSearch(): Promise<Publisher[]> {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for search");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_search))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for search:", error);
    return [];
  }
}

export async function getClientInfo(clientId: string): Promise<ClientInfo | null> {
  try {
    const response = await fetch(`${CLIENTS_BASE_URL}/clients/${clientId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch client information");
    }
    const clientInfo = await response.json();

    if (typeof (clientInfo as any).feesearch !== "number") {
      console.warn("feesearch is not a number:", (clientInfo as any).feesearch);
      (clientInfo as any).feesearch = 0;
    }

    return clientInfo;
  } catch (error) {
    console.error("Error fetching client info:", error);
    return null;
  }
}

export async function getMediaPlans() {
  const response = await fetch('/api/mediaplans');
  if (!response.ok) {
    throw new Error("Failed to fetch media plans");
  }
  return response.json();
}

export async function getPublishersForSocialMedia() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for search");
    }
    const data = await response.json();
    
    // Ensure data is an array before filtering
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_socialmedia)) // Works for both `true/false` and `1/0`
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for social:", error);
    return []; // Prevents app crash
  }
}

export async function getPublishersForTelevision() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for television");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_television))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for television:", error);
    return [];
  }
}

export async function getPublishersForRadio() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for radio");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_radio))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for radio:", error);
    return [];
  }
}

export async function getPublishersForNewspapers() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for newspapers");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_newspaper))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for newspapers:", error);
    return [];
  }
}

export async function getPublishersForMagazines() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for magazines");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_magazines))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for magazines:", error);
    return [];
  }
}

export async function getPublishersForOoh() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for OOH");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_ooh))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for OOH:", error);
    return [];
  }
}

export async function getPublishersForCinema() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for cinema");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_cinema))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for cinema:", error);
    return [];
  }
}

export async function getPublishersForDigiDisplay() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for digital display");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_digidisplay))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for digital display:", error);
    return [];
  }
}

export async function getPublishersForDigiAudio() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for digital audio");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_digiaudio))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for digital audio:", error);
    return [];
  }
}

export async function getPublishersForDigiVideo() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for digital video");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_digivideo))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for digital video:", error);
    return [];
  }
}

export async function getPublishersForBvod() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for BVOD");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_bvod))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for BVOD:", error);
    return [];
  }
}

export async function getPublishersForIntegration() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for integration");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_integration))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for integration:", error);
    return [];
  }
}

export async function getPublishersForProgDisplay() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for programmatic display");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_progdisplay))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for programmatic display:", error);
    return [];
  }
}

export async function getPublishersForProgVideo() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for programmatic video");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_progvideo))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for programmatic video:", error);
    return [];
  }
}

export async function getPublishersForProgBvod() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for programmatic BVOD");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_progbvod))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for programmatic BVOD:", error);
    return [];
  }
}

export async function getPublishersForProgAudio() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for programmatic audio");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_progaudio))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for programmatic audio:", error);
    return [];
  }
}

export async function getPublishersForProgOoh() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for programmatic OOH");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_progooh))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for programmatic OOH:", error);
    return [];
  }
}

export async function getPublishersForInfluencers() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for influencers");
    }
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_influencers))
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for influencers:", error);
    return [];
  }
}

// Television data saving functions
export async function saveTelevisionData(televisionData: any) {
  try {
    const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_television`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XANO_API_KEY}`,
      },
      body: JSON.stringify(televisionData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to save television data");
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error saving television data:", error);
    throw error;
  }
}

export async function saveTelevisionLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, televisionLineItems: any[]) {
  try {
    const savePromises = televisionLineItems.map(async (lineItem, index) => {
      // Format bursts data to ensure dates are properly serialized
      // Television has special fields (size, tarps) which will be preserved by extractAndFormatBursts
      const formattedBursts = extractAndFormatBursts(lineItem);

      const televisionData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        market: getField(lineItem, 'market', 'market', ''),
        network: getField(lineItem, 'network', 'network', ''),
        station: getField(lineItem, 'station', 'station', ''),
        daypart: getField(lineItem, 'daypart', 'daypart', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        line_item_id: `${mbaNumber}TV${index + 1}`,
        creative: getField(lineItem, 'creative', 'creative', ''),
        bursts_json: formattedBursts,
        line_item: index + 1,
      };

      return await saveTelevisionData(televisionData);
    });

    const results = await Promise.all(savePromises);
    return results;
  } catch (error) {
    console.error("Error saving television line items:", error);
    throw error;
  }
}

// Newspaper data saving functions
export async function saveNewspaperData(newspaperData: any) {
  try {
    const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_newspaper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XANO_API_KEY}`,
      },
      body: JSON.stringify(newspaperData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to save newspaper data");
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error saving newspaper data:", error);
    throw error;
  }
}

export async function saveNewspaperLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, newspaperLineItems: any[]) {
  try {
    const savePromises = newspaperLineItems.map(async (lineItem, index) => {
      // Format bursts data to ensure dates are properly serialized
      const formattedBursts = extractAndFormatBursts(lineItem);

      const newspaperData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        network: getField(lineItem, 'network', 'network', ''),
        publisher: getField(lineItem, 'publisher', 'publisher', ''),
        title: getField(lineItem, 'title', 'title', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        size: getField(lineItem, 'size', 'size', ''),
        format: getField(lineItem, 'format', 'format', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        line_item_id: `${mbaNumber}NP${index + 1}`,
        bursts_json: formattedBursts,
        line_item: index + 1,
      };

      return await saveNewspaperData(newspaperData);
    });

    const results = await Promise.all(savePromises);
    return results;
  } catch (error) {
    console.error("Error saving newspaper line items:", error);
    throw error;
  }
}

// Social Media data saving functions
export async function saveSocialMediaData(socialMediaData: any) {
  try {
    const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_social`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XANO_API_KEY}`,
      },
      body: JSON.stringify(socialMediaData),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to save social media data");
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error saving social media data:", error);
    throw error;
  }
}

/**
 * Helper function to get a field value supporting both snake_case and camelCase
 */
function getField(lineItem: any, snakeCase: string, camelCase: string, defaultValue: any = ""): any {
  return lineItem[snakeCase] !== undefined ? lineItem[snakeCase] : (lineItem[camelCase] !== undefined ? lineItem[camelCase] : defaultValue);
}

/**
 * Helper function to get a boolean field value supporting both snake_case and camelCase
 */
function getBooleanField(lineItem: any, snakeCase: string, camelCase: string, defaultValue: boolean = false): boolean {
  const value = lineItem[snakeCase] !== undefined ? lineItem[snakeCase] : lineItem[camelCase];
  return value !== undefined ? value : defaultValue;
}

/**
 * Provide consistent line item identifiers with sane fallbacks.
 */
function buildLineItemMeta(lineItem: any, mbaNumber: string, index: number, prefix: string) {
  return {
    line_item_id: getField(lineItem, 'line_item_id', 'lineItemId', `${mbaNumber}${prefix}${index + 1}`),
    line_item: getField(lineItem, 'line_item', 'lineItem', index + 1),
  };
}

/**
 * Helper function to extract and format bursts from a line item.
 * Handles both lineItem.bursts (array) and lineItem.bursts_json (string) cases.
 * Formats all burst fields with proper names and handles date serialization.
 */
function extractAndFormatBursts(lineItem: any): any[] {
  let bursts: any[] = [];

  // First, try to get bursts from lineItem.bursts (array) - matches radio schema
  if (Array.isArray(lineItem.bursts)) {
    bursts = lineItem.bursts;
  }
  // If not found, try to parse from lineItem.bursts_json (string) - for backward compatibility
  else if (lineItem.bursts_json) {
    try {
      if (typeof lineItem.bursts_json === 'string') {
        const trimmed = lineItem.bursts_json.trim();
        if (trimmed) {
          bursts = JSON.parse(trimmed);
        }
      } else if (Array.isArray(lineItem.bursts_json)) {
        bursts = lineItem.bursts_json;
      } else if (typeof lineItem.bursts_json === 'object') {
        bursts = [lineItem.bursts_json];
      }
    } catch (parseError) {
      console.error('Error parsing bursts_json:', parseError, lineItem.bursts_json);
      bursts = [];
    }
  }
  // Also check if bursts is a non-array object (should be converted to array)
  else if (lineItem.bursts && typeof lineItem.bursts === 'object' && !Array.isArray(lineItem.bursts)) {
    bursts = [lineItem.bursts];
  }

  // Ensure bursts is an array
  if (!Array.isArray(bursts)) {
    bursts = [];
  }

  // Format all burst fields with proper names and handle date serialization
  // Preserve all original fields while ensuring standard fields are properly formatted
  const formatBurstDate = (value: any) => {
    if (!value) return "";
    if (value instanceof Date) return toMelbourneDateString(value);
    return value;
  };

  return bursts.map((burst: any) => {
    const formattedBurst: any = {
      budget: burst.budget || "",
      buyAmount: burst.buyAmount || "",
      startDate: formatBurstDate(burst.startDate),
      endDate: formatBurstDate(burst.endDate),
      calculatedValue: burst.calculatedValue || 0,
      fee: burst.fee || 0,
    };
    
    // Preserve any additional fields from the original burst (e.g., size, tarps for television)
    Object.keys(burst).forEach(key => {
      if (!['budget', 'buyAmount', 'startDate', 'endDate', 'calculatedValue', 'fee'].includes(key)) {
        formattedBurst[key] = burst[key];
      }
    });
    
    return formattedBurst;
  });
}

export async function saveSocialMediaLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, socialMediaLineItems: any[]) {
  try {
    const savePromises = socialMediaLineItems.map(async (lineItem, index) => {
      // Format bursts data to ensure dates are properly serialized
      const formattedBursts = extractAndFormatBursts(lineItem);

      const socialMediaData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: lineItem.platform || "",
        bid_strategy: lineItem.bid_strategy || lineItem.bidStrategy || "",
        buy_type: lineItem.buy_type || lineItem.buyType || "",
        creative_targeting: lineItem.creative_targeting || lineItem.creativeTargeting || "",
        creative: lineItem.creative || "",
        buying_demo: lineItem.buying_demo || lineItem.buyingDemo || "",
        market: lineItem.market || "",
        fixed_cost_media: lineItem.fixed_cost_media !== undefined ? lineItem.fixed_cost_media : (lineItem.fixedCostMedia || false),
        client_pays_for_media: lineItem.client_pays_for_media !== undefined ? lineItem.client_pays_for_media : (lineItem.clientPaysForMedia || false),
        budget_includes_fees: lineItem.budget_includes_fees !== undefined ? lineItem.budget_includes_fees : (lineItem.budgetIncludesFees || false),
        line_item_id: `${mbaNumber}SM${index + 1}`,
        bursts_json: formattedBursts,
        line_item: index + 1,
      };

      return await saveSocialMediaData(socialMediaData);
    });

    const results = await Promise.all(savePromises);
    return results;
  } catch (error) {
    console.error("Error saving social media line items:", error);
    throw error;
  }
}




// ===== COMPREHENSIVE CRUD FUNCTIONS FOR ALL 18 MEDIA TYPES =====

// Cinema CRUD Functions
export async function getCinemaLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<CinemaLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_cinema?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching cinema line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching cinema line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XANO_API_KEY}`,
      }
    });
    if (!response.ok) {
      // Handle 404 gracefully - just means no line items exist yet
      if (response.status === 404) {
        console.log(`[API] No cinema line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      console.warn(`[API] Failed to fetch cinema line items (${response.status})`);
      return [];
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching cinema line items:", error);
    return [];
  }
}

export async function createCinemaLineItem(data: Partial<CinemaLineItem>): Promise<CinemaLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_cinema`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XANO_API_KEY}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create cinema line item");
  return response.json();
}

export async function updateCinemaLineItem(id: number, data: Partial<CinemaLineItem>): Promise<CinemaLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_cinema/${id}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XANO_API_KEY}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update cinema line item");
  return response.json();
}

export async function deleteCinemaLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_cinema/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${XANO_API_KEY}`,
    },
  });
  if (!response.ok) throw new Error("Failed to delete cinema line item");
}

// Digital Audio CRUD Functions
export async function getDigitalAudioLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<DigitalAudioLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_digi_audio?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching digital audio line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching digital audio line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XANO_API_KEY}`,
      }
    });
    if (!response.ok) {
      throw new Error("Failed to fetch digital audio line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching digital audio line items:", error);
    return [];
  }
}

export async function createDigitalAudioLineItem(data: Partial<DigitalAudioLineItem>): Promise<DigitalAudioLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create digital audio line item");
  return response.json();
}

export async function updateDigitalAudioLineItem(id: number, data: Partial<DigitalAudioLineItem>): Promise<DigitalAudioLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_audio/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update digital audio line item");
  return response.json();
}

export async function deleteDigitalAudioLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_audio/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete digital audio line item");
}

// BVOD CRUD Functions
export async function getBVODLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<BVODLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_digi_bvod?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching BVOD line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching BVOD line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch BVOD line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching BVOD line items:", error);
    return [];
  }
}

export async function createBVODLineItem(data: Partial<BVODLineItem>): Promise<BVODLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_bvod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create BVOD line item");
  return response.json();
}

export async function updateBVODLineItem(id: number, data: Partial<BVODLineItem>): Promise<BVODLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_bvod/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update BVOD line item");
  return response.json();
}

export async function deleteBVODLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_bvod/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete BVOD line item");
}

// Digital Display CRUD Functions
export async function getDigitalDisplayLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<DigitalDisplayLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_digi_display?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching digital display line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching digital display line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch digital display line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching digital display line items:", error);
    return [];
  }
}

export async function createDigitalDisplayLineItem(data: Partial<DigitalDisplayLineItem>): Promise<DigitalDisplayLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_display`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create digital display line item");
  return response.json();
}

export async function updateDigitalDisplayLineItem(id: number, data: Partial<DigitalDisplayLineItem>): Promise<DigitalDisplayLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_display/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update digital display line item");
  return response.json();
}

export async function deleteDigitalDisplayLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_display/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete digital display line item");
}

// Digital Video CRUD Functions
export async function getDigitalVideoLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<DigitalVideoLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_digi_video?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching digital video line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching digital video line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch digital video line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching digital video line items:", error);
    return [];
  }
}

export async function createDigitalVideoLineItem(data: Partial<DigitalVideoLineItem>): Promise<DigitalVideoLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create digital video line item");
  return response.json();
}

export async function updateDigitalVideoLineItem(id: number, data: Partial<DigitalVideoLineItem>): Promise<DigitalVideoLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_video/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update digital video line item");
  return response.json();
}

export async function deleteDigitalVideoLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_video/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete digital video line item");
}

// Magazines CRUD Functions
export async function getMagazinesLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<MagazinesLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_magazines?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching magazines line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching magazines line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch magazines line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching magazines line items:", error);
    return [];
  }
}

export async function createMagazinesLineItem(data: Partial<MagazinesLineItem>): Promise<MagazinesLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_magazines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create magazines line item");
  return response.json();
}

export async function updateMagazinesLineItem(id: number, data: Partial<MagazinesLineItem>): Promise<MagazinesLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_magazines/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update magazines line item");
  return response.json();
}

export async function deleteMagazinesLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_magazines/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete magazines line item");
}

// Newspaper CRUD Functions
export async function getNewspaperLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<NewspaperLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_newspaper?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching newspaper line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching newspaper line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch newspaper line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching newspaper line items:", error);
    return [];
  }
}

export async function createNewspaperLineItem(data: Partial<NewspaperLineItem>): Promise<NewspaperLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_newspaper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create newspaper line item");
  return response.json();
}

export async function updateNewspaperLineItem(id: number, data: Partial<NewspaperLineItem>): Promise<NewspaperLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_newspaper/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update newspaper line item");
  return response.json();
}

export async function deleteNewspaperLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_newspaper/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete newspaper line item");
}

// OOH CRUD Functions
export async function getOOHLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<OOHLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_ooh?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching OOH line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching OOH line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch OOH line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching OOH line items:", error);
    return [];
  }
}

export async function createOOHLineItem(data: Partial<OOHLineItem>): Promise<OOHLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_ooh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create OOH line item");
  return response.json();
}

export async function updateOOHLineItem(id: number, data: Partial<OOHLineItem>): Promise<OOHLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_ooh/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update OOH line item");
  return response.json();
}

export async function deleteOOHLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_ooh/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete OOH line item");
}

// Programmatic Audio CRUD Functions
export async function getProgAudioLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<ProgAudioLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_prog_audio?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching programmatic audio line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching programmatic audio line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch programmatic audio line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching programmatic audio line items:", error);
    return [];
  }
}

export async function createProgAudioLineItem(data: Partial<ProgAudioLineItem>): Promise<ProgAudioLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create programmatic audio line item");
  return response.json();
}

export async function updateProgAudioLineItem(id: number, data: Partial<ProgAudioLineItem>): Promise<ProgAudioLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_audio/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update programmatic audio line item");
  return response.json();
}

export async function deleteProgAudioLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_audio/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete programmatic audio line item");
}

// Programmatic BVOD CRUD Functions
export async function getProgBVODLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<ProgBVODLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_prog_bvod?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching programmatic BVOD line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching programmatic BVOD line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch programmatic BVOD line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching programmatic BVOD line items:", error);
    return [];
  }
}

export async function createProgBVODLineItem(data: Partial<ProgBVODLineItem>): Promise<ProgBVODLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_bvod`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create programmatic BVOD line item");
  return response.json();
}

export async function updateProgBVODLineItem(id: number, data: Partial<ProgBVODLineItem>): Promise<ProgBVODLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_bvod/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update programmatic BVOD line item");
  return response.json();
}

export async function deleteProgBVODLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_bvod/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete programmatic BVOD line item");
}

// Programmatic Display CRUD Functions
export async function getProgDisplayLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<ProgDisplayLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_prog_display?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching programmatic display line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching programmatic display line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch programmatic display line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching programmatic display line items:", error);
    return [];
  }
}

export async function createProgDisplayLineItem(data: Partial<ProgDisplayLineItem>): Promise<ProgDisplayLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_display`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create programmatic display line item");
  return response.json();
}

export async function updateProgDisplayLineItem(id: number, data: Partial<ProgDisplayLineItem>): Promise<ProgDisplayLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_display/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update programmatic display line item");
  return response.json();
}

export async function deleteProgDisplayLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_display/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete programmatic display line item");
}

// Programmatic OOH CRUD Functions
export async function getProgOOHLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<ProgOOHLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_prog_ooh?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching programmatic OOH line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching programmatic OOH line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch programmatic OOH line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching programmatic OOH line items:", error);
    return [];
  }
}

export async function createProgOOHLineItem(data: Partial<ProgOOHLineItem>): Promise<ProgOOHLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_ooh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create programmatic OOH line item");
  return response.json();
}

export async function updateProgOOHLineItem(id: number, data: Partial<ProgOOHLineItem>): Promise<ProgOOHLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_ooh/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update programmatic OOH line item");
  return response.json();
}

export async function deleteProgOOHLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_ooh/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete programmatic OOH line item");
}

// Programmatic Video CRUD Functions
export async function getProgVideoLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<ProgVideoLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_prog_video?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching programmatic video line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching programmatic video line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch programmatic video line items");
    }
    return response.json();
  } catch (error) {
    console.error("Error fetching programmatic video line items:", error);
    return [];
  }
}

export async function createProgVideoLineItem(data: Partial<ProgVideoLineItem>): Promise<ProgVideoLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create programmatic video line item");
  return response.json();
}

export async function updateProgVideoLineItem(id: number, data: Partial<ProgVideoLineItem>): Promise<ProgVideoLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_video/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update programmatic video line item");
  return response.json();
}

export async function deleteProgVideoLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_video/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete programmatic video line item");
}

// Radio CRUD Functions
export async function getRadioLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<RadioLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_radio?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching radio line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching radio line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      // Handle 404 gracefully - just means no line items exist yet
      if (response.status === 404) {
        console.log(`[API] No radio line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      console.warn(`[API] Failed to fetch radio line items (${response.status})`);
      return [];
    }
    return response.json();
  } catch (error) {
    console.warn("Error fetching radio line items:", error);
    return [];
  }
}

export async function createRadioLineItem(data: Partial<RadioLineItem>): Promise<RadioLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_radio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create radio line item");
  return response.json();
}

export async function updateRadioLineItem(id: number, data: Partial<RadioLineItem>): Promise<RadioLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_radio/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update radio line item");
  return response.json();
}

export async function deleteRadioLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_radio/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete radio line item");
}

// Search CRUD Functions
export async function getSearchLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<SearchLineItem[]> {
  try {
    let url = `/api/media_plans/search?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&media_plan_version=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching search line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching search line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      // Handle 404 gracefully - just means no line items exist yet
      if (response.status === 404) {
        console.log(`[API] No search line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      // For other errors, log but still return empty array
      console.warn(`[API] Failed to fetch search line items (${response.status})`);
      return [];
    }
    return response.json();
  } catch (error) {
    console.warn("Error fetching search line items:", error);
    return [];
  }
}

export async function createSearchLineItem(data: Partial<SearchLineItem>): Promise<SearchLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create search line item");
  return response.json();
}

export async function updateSearchLineItem(id: number, data: Partial<SearchLineItem>): Promise<SearchLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_search/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update search line item");
  return response.json();
}

export async function deleteSearchLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_search/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete search line item");
}

// Production CRUD Functions
export async function getProductionLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<ProductionLineItem[]> {
  try {
    let url = `/api/media_plans/production?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&media_plan_version=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching production line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching production line items for MBA ${mbaNumber} without version number`);
    }

    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[API] No production line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      console.warn(`[API] Failed to fetch production line items (${response.status})`);
      return [];
    }

    return response.json();
  } catch (error) {
    console.warn("Error fetching production line items:", error);
    return [];
  }
}

export async function saveProductionLineItems(
  mediaPlanVersionId: number,
  mbaNumber: string,
  clientName: string,
  planNumber: string,
  productionLineItems: any[]
) {
  try {
    const savePromises = productionLineItems.map(async (lineItem, index) => {
      let rawBursts: any[] = [];
      if (Array.isArray(lineItem.bursts)) {
        rawBursts = lineItem.bursts;
      } else if (Array.isArray(lineItem.bursts_json)) {
        rawBursts = lineItem.bursts_json;
      } else if (typeof lineItem.bursts_json === 'string') {
        try {
          const parsed = JSON.parse(lineItem.bursts_json);
          if (Array.isArray(parsed)) {
            rawBursts = parsed;
          }
        } catch (err) {
          console.warn('Failed to parse production bursts_json', err);
        }
      }

      const formattedBursts = rawBursts.map((burst: any) => {
        const cost = typeof burst.cost === 'string'
          ? parseFloat(burst.cost.replace(/[^0-9.-]/g, '')) || 0
          : Number(burst.cost ?? 0);
        const amount = typeof burst.amount === 'string'
          ? parseFloat(burst.amount.replace(/[^0-9.-]/g, '')) || 0
          : Number(burst.amount ?? 0);

        const mediaValue = Number.isFinite(cost * amount) ? cost * amount : 0;
        const calculatedValue = burst.calculatedValue ?? amount ?? 0;

        const toDateString = (value: any) =>
          value instanceof Date ? toMelbourneDateString(value) : value ?? "";

        return {
          ...burst,
          cost,
          amount,
          calculatedValue,
          mediaValue,
          startDate: toDateString(burst.startDate),
          endDate: toDateString(burst.endDate),
        };
      });

      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'PROD');

      const productionData: ProductionLineItem = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        media_type: getField(lineItem, 'media_type', 'mediaType', ''),
        publisher: getField(lineItem, 'publisher', 'publisher', ''),
        description: getField(lineItem, 'description', 'description', ''),
        market: getField(lineItem, 'market', 'market', ''),
        line_item_id,
        bursts_json: formattedBursts,
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_production`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(productionData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save production line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Production line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving production line items:', error);
    throw error;
  }
}

// Social Media CRUD Functions
export async function getSocialMediaLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<SocialMediaLineItem[]> {
  try {
    let url = `/api/media_plans/social?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&media_plan_version=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching social media line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching social media line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      // Handle 404 gracefully - just means no line items exist yet
      if (response.status === 404) {
        console.log(`[API] No social media line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      // For other errors, log but still return empty array
      let errorMessage = "Failed to fetch social media line items";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        console.warn("Social Media API error details:", errorData);
        console.warn("Social Media API response status:", response.status);
      } catch (parseError) {
        console.warn("Failed to parse error response:", parseError);
        console.warn("Social Media API response status:", response.status);
      }
      // Don't throw - just return empty array
      return [];
    }
    return response.json();
  } catch (error) {
    console.warn("Error fetching social media line items:", error);
    return [];
  }
}

export async function createSocialMediaLineItem(data: Partial<SocialMediaLineItem>): Promise<SocialMediaLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create social media line item");
  return response.json();
}

export async function updateSocialMediaLineItem(id: number, data: Partial<SocialMediaLineItem>): Promise<SocialMediaLineItem> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_social/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update social media line item");
  return response.json();
}

export async function deleteSocialMediaLineItem(id: number): Promise<void> {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_social/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete social media line item");
}

// Television CRUD Functions
export async function getTelevisionLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<TelevisionLineItem[]> {
  try {
    let url = `/api/media_plans/television?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&media_plan_version=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching television line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching television line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      // Handle 404 gracefully - just means no line items exist yet
      if (response.status === 404) {
        console.log(`[API] No television line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      // For other errors, log but still return empty array
      let errorMessage = "Failed to fetch television line items";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        console.warn("Television API error details:", errorData);
      } catch (parseError) {
        console.warn("Failed to parse error response:", parseError);
      }
      // Don't throw - just return empty array
      return [];
    }
    return response.json();
  } catch (error) {
    console.warn("Error fetching television line items:", error);
    return [];
  }
}

export async function createTelevisionLineItem(data: Partial<TelevisionLineItem>): Promise<TelevisionLineItem> {
  const response = await fetch(`/api/media_plans/television`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create television line item");
  return response.json();
}

export async function updateTelevisionLineItem(id: number, data: Partial<TelevisionLineItem>): Promise<TelevisionLineItem> {
  const response = await fetch(`/api/media_plans/television/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update television line item");
  return response.json();
}

export async function deleteTelevisionLineItem(id: number): Promise<void> {
  const response = await fetch(`/api/media_plans/television/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error("Failed to delete television line item");
}

// Missing GET Functions
export async function getIntegrationLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<IntegrationLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_integration?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching integration line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching integration line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      // Handle 404 gracefully - just means no line items exist yet
      if (response.status === 404) {
        console.log(`[API] No integration line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      console.warn(`[API] Failed to fetch integration line items (${response.status})`);
      return [];
    }
    return response.json();
  } catch (error) {
    console.warn("Error fetching integration line items:", error);
    return [];
  }
}

export async function getInfluencersLineItemsByMBA(mbaNumber: string, mediaPlanVersion?: number): Promise<InfluencersLineItem[]> {
  try {
    let url = `${MEDIA_PLANS_BASE_URL}/media_plan_influencers?mba_number=${mbaNumber}`;
    if (mediaPlanVersion !== undefined && mediaPlanVersion !== null) {
      url += `&version_number=${mediaPlanVersion}&mp_plannumber=${mediaPlanVersion}`;
      console.log(`[API] Fetching influencers line items for MBA ${mbaNumber} with version ${mediaPlanVersion}`);
    } else {
      console.log(`[API] Fetching influencers line items for MBA ${mbaNumber} without version number`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      // Handle 404 gracefully - just means no line items exist yet
      if (response.status === 404) {
        console.log(`[API] No influencers line items found for MBA ${mbaNumber} (404)`);
        return [];
      }
      console.warn(`[API] Failed to fetch influencers line items (${response.status})`);
      return [];
    }
    return response.json();
  } catch (error) {
    console.warn("Error fetching influencers line items:", error);
    return [];
  }
}

// Additional Save Functions for Bulk Operations
export async function saveRadioLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, radioLineItems: any[]) {
  try {
    const savePromises = radioLineItems.map(async (lineItem, index) => {
      // Format bursts data to ensure dates are properly serialized
      const formattedBursts = extractAndFormatBursts(lineItem);
      
      // Log for debugging
      console.log(`[Radio] Saving line item ${index + 1}:`, {
        line_item_id: getField(lineItem, 'line_item_id', 'line_item_id', `${mbaNumber}RAD${index + 1}`),
        bursts_count: formattedBursts.length,
        bursts: formattedBursts,
      });

      const radioData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        network: getField(lineItem, 'network', 'network', ''),
        station: getField(lineItem, 'station', 'station', ''),
        platform: getField(lineItem, 'platform', 'platform', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        format: getField(lineItem, 'format', 'format', ''),
        duration: getField(lineItem, 'duration', 'duration', ''),
        size: getField(lineItem, 'size', 'size', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id: getField(lineItem, 'line_item_id', 'line_item_id', `${mbaNumber}RAD${index + 1}`),
        bursts: formattedBursts, // Use 'bursts' to match database schema
        line_item: getField(lineItem, 'line_item', 'line_item', index + 1),
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_radio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(radioData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save radio line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Radio line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving radio line items:', error);
    throw error;
  }
}

export async function saveMagazinesLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, magazinesLineItems: any[]) {
  try {
    const savePromises = magazinesLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'MAG');

      const magazinesData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        network: getField(lineItem, 'network', 'network', ''),
        publisher: getField(lineItem, 'publisher', 'publisher', ''),
        title: getField(lineItem, 'title', 'title', ''),
        publication: getField(lineItem, 'publication', 'publication', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        size: getField(lineItem, 'size', 'size', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_magazines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(magazinesData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save magazines line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Magazines line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving magazines line items:', error);
    throw error;
  }
}

export async function saveOOHLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, oohLineItems: any[]) {
  try {
    const savePromises = oohLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'OOH');

      const oohData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        network: getField(lineItem, 'network', 'network', ''),
        environment: getField(lineItem, 'environment', 'environment', ''),
        format: getField(lineItem, 'format', 'format', ''),
        type: getField(lineItem, 'type', 'type', getField(lineItem, 'environment', 'environment', '')),
        location: getField(lineItem, 'location', 'location', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        size: getField(lineItem, 'size', 'size', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_ooh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(oohData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save OOH line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('OOH line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving OOH line items:', error);
    throw error;
  }
}

export async function saveCinemaLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, cinemaLineItems: any[], versionNumber?: number) {
  try {
    const savePromises = cinemaLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);

      const cinemaData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        version_number: versionNumber || 1,
        network: getField(lineItem, 'network', 'network', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        format: getField(lineItem, 'format', 'format', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id: lineItem.line_item_id || `${mbaNumber}CN${index + 1}`,
        line_item: lineItem.line_item || index + 1,
        station: getField(lineItem, 'station', 'station', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        duration: getField(lineItem, 'duration', 'duration', ''),
        bursts: JSON.stringify(formattedBursts),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_cinema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(cinemaData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save cinema line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Cinema line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving cinema line items:', error);
    throw error;
  }
}

export async function saveDigitalDisplayLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, digitalDisplayLineItems: any[]) {
  try {
    const savePromises = digitalDisplayLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'DD');

      const digitalDisplayData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        publisher: getField(lineItem, 'publisher', 'publisher', ''),
        site: getField(lineItem, 'site', 'site', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        size: getField(lineItem, 'size', 'size', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_display`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(digitalDisplayData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save digital display line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Digital display line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving digital display line items:', error);
    throw error;
  }
}

export async function saveDigitalAudioLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, digitalAudioLineItems: any[]) {
  try {
    const savePromises = digitalAudioLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);

      const digitalAudioData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        publisher: getField(lineItem, 'publisher', 'publisher', ''),
        site: getField(lineItem, 'site', 'site', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id: lineItem.line_item_id || `${mbaNumber}DA${index + 1}`,
        bursts_json: JSON.stringify(formattedBursts),
        line_item: lineItem.line_item || index + 1,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(digitalAudioData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save digital audio line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Digital audio line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving digital audio line items:', error);
    throw error;
  }
}

export async function saveDigitalVideoLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, digitalVideoLineItems: any[]) {
  try {
    const savePromises = digitalVideoLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'DV');

      const digitalVideoData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        publisher: getField(lineItem, 'publisher', 'publisher', ''),
        site: getField(lineItem, 'site', 'site', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        size: getField(lineItem, 'size', 'size', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(digitalVideoData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save digital video line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Digital video line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving digital video line items:', error);
    throw error;
  }
}

export async function saveBVODLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, bvodLineItems: any[]) {
  try {
    const savePromises = bvodLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'BVOD');

      const bvodData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        publisher: getField(lineItem, 'publisher', 'publisher', ''),
        site: getField(lineItem, 'site', 'site', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        size: getField(lineItem, 'size', 'size', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_digi_bvod`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(bvodData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save BVOD line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('BVOD line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving BVOD line items:', error);
    throw error;
  }
}

export async function saveIntegrationLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, integrationLineItems: any[]) {
  try {
    const savePromises = integrationLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'INT');

      const integrationData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        objective: getField(lineItem, 'objective', 'objective', ''),
        campaign: getField(lineItem, 'campaign', 'campaign', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_integration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(integrationData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save integration line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Integration line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving integration line items:', error);
    throw error;
  }
}

export async function saveSearchLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, searchLineItems: any[]) {
  try {
    const savePromises = searchLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'SEA');

      const searchData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        objective: getField(lineItem, 'objective', 'objective', ''),
        campaign: getField(lineItem, 'campaign', 'campaign', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(searchData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save search line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Search line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving search line items:', error);
    throw error;
  }
}

export async function saveProgDisplayLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, progDisplayLineItems: any[]) {
  try {
    const savePromises = progDisplayLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'PD');

      const progDisplayData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        site: getField(lineItem, 'site', 'site', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        size: getField(lineItem, 'size', 'size', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_display`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(progDisplayData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save programmatic display line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Programmatic display line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving programmatic display line items:', error);
    throw error;
  }
}

export async function saveProgVideoLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, progVideoLineItems: any[]) {
  try {
    const savePromises = progVideoLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'PV');

      const progVideoData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        site: getField(lineItem, 'site', 'site', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        size: getField(lineItem, 'size', 'size', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(progVideoData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save programmatic video line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Programmatic video line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving programmatic video line items:', error);
    throw error;
  }
}

export async function saveProgBVODLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, progBVODLineItems: any[]) {
  try {
    const savePromises = progBVODLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'PBV');

      const progBVODData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        site: getField(lineItem, 'site', 'site', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        size: getField(lineItem, 'size', 'size', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_bvod`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(progBVODData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save programmatic BVOD line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Programmatic BVOD line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving programmatic BVOD line items:', error);
    throw error;
  }
}

export async function saveProgAudioLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, progAudioLineItems: any[]) {
  try {
    const savePromises = progAudioLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'PA');

      const progAudioData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        site: getField(lineItem, 'site', 'site', ''),
        placement: getField(lineItem, 'placement', 'placement', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(progAudioData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save programmatic audio line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Programmatic audio line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving programmatic audio line items:', error);
    throw error;
  }
}

export async function saveProgOOHLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, progOOHLineItems: any[]) {
  try {
    const savePromises = progOOHLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'POOH');

      const progOOHData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        bid_strategy: getField(lineItem, 'bid_strategy', 'bidStrategy', ''),
        environment: getField(lineItem, 'environment', 'environment', ''),
        format: getField(lineItem, 'format', 'format', ''),
        location: getField(lineItem, 'location', 'location', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        creative_targeting: getField(lineItem, 'creative_targeting', 'creativeTargeting', ''),
        creative: getField(lineItem, 'creative', 'creative', ''),
        buying_demo: getField(lineItem, 'buying_demo', 'buyingDemo', ''),
        market: getField(lineItem, 'market', 'market', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_prog_ooh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(progOOHData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save programmatic OOH line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Programmatic OOH line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving programmatic OOH line items:', error);
    throw error;
  }
}

export async function saveInfluencersLineItems(mediaPlanVersionId: number, mbaNumber: string, clientName: string, planNumber: string, influencersLineItems: any[]) {
  try {
    const savePromises = influencersLineItems.map(async (lineItem, index) => {
      const formattedBursts = extractAndFormatBursts(lineItem);
      const { line_item_id, line_item } = buildLineItemMeta(lineItem, mbaNumber, index, 'INF');

      const influencersData = {
        media_plan_version: mediaPlanVersionId,
        mba_number: mbaNumber,
        mp_client_name: clientName,
        mp_plannumber: planNumber,
        platform: getField(lineItem, 'platform', 'platform', ''),
        objective: getField(lineItem, 'objective', 'objective', ''),
        campaign: getField(lineItem, 'campaign', 'campaign', ''),
        buy_type: getField(lineItem, 'buy_type', 'buyType', ''),
        targeting_attribute: getField(lineItem, 'targeting_attribute', 'targetingAttribute', ''),
        fixed_cost_media: getBooleanField(lineItem, 'fixed_cost_media', 'fixedCostMedia', false),
        client_pays_for_media: getBooleanField(lineItem, 'client_pays_for_media', 'clientPaysForMedia', false),
        budget_includes_fees: getBooleanField(lineItem, 'budget_includes_fees', 'budgetIncludesFees', false),
        no_adserving: getBooleanField(lineItem, 'no_adserving', 'noadserving', false),
        line_item_id,
        bursts_json: JSON.stringify(formattedBursts),
        line_item,
      };

      const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_influencers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XANO_API_KEY}`,
        },
        body: JSON.stringify(influencersData),
      });

      if (!response.ok) {
        throw new Error(`Failed to save influencers line item ${index + 1}: ${response.statusText}`);
      }

      return await response.json();
    });

    const results = await Promise.all(savePromises);
    console.log('Influencers line items saved successfully:', results);
    return results;
  } catch (error) {
    console.error('Error saving influencers line items:', error);
    throw error;
  }
}

