const SEARCH_BASE_URL = process.env.XANO_SEARCH_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:TMcVkd1X"
const PUBLISHERS_BASE_URL = process.env.XANO_PUBLISHERS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:YkRK8qLP"
const CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const MEDIA_DETAILS_BASE_URL = process.env.XANO_MEDIA_DETAILS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:di-s-JRc" 
const MEDIA_PLANS_BASE_URL = process.env.XANO_MEDIA_PLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"



interface MediaPlan {
  mp_clientname: string;
  mp_campaignname: string;
  mbanumber: string;
}

interface MediaPlanVersion {
  media_plan_id: number; // This will link to the record in the `media_plans` table
  version_number: number;
  mba_number: string;
  po_number: string;
  campaign_name: string;
  campaign_status: string;
  campaign_start_date: string;
  campaign_end_date: string;
  brand: string;
  client_contact: string;
  fixed_fee: boolean;
  mp_campaignbudget: number;
  billingSchedule?: any; // or a more specific type if you have one
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
  // Add excel_file, mba_pdf_file, and created_by if you are handling them now
}

// Add TypeScript interfaces
interface SearchLineItem {
  id?: string;
  mbanumber: string;
  platform: string;
  bid_strategy: string;
  buy_type: string;
  creative_targeting: string;
  is_fixed_cost: boolean;
  client_pays_for_media: boolean;
  total_budget: number;
  line_item_id: string;
}

interface SearchBurst {
  line_item_id: string;
  mbanumber: string;
  burst_number: number;
  budget: number;
  buy_amount: number;
  start_date: Date | string;
  end_date: Date | string;
}

interface Publisher {
  id: number;
  publisher_name: string;
}

interface ClientInfo {
  id: string;
  name: string;
  feesearch: number;
  // Add other client fields as needed
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
  const response = await fetch(`${MEDIA_DETAILS_BASE_URL}/magazine_adsizes`);
  if (!response.ok) {
    throw new Error("Failed to fetch magazines ad sizes");
  }
  return response.json();
}

export async function getSearchLineItems(): Promise<SearchLineItem[]> {
  const response = await fetch(`${SEARCH_BASE_URL}/GET_search_line_items`);
  if (!response.ok) {
    throw new Error("Failed to fetch search line items");
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

export async function createSearchLineItem(data: SearchLineItem): Promise<SearchLineItem> {
  const response = await fetch(`${SEARCH_BASE_URL}/POST_search_line_items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to create search line item");
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

export async function createSearchBurst(data: SearchBurst): Promise<SearchBurst> {
  const response = await fetch(`${SEARCH_BASE_URL}/POST_search_bursts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to create search burst");
  }
  return response.json();
}

export async function getSearchLineItemHistory() {
  const response = await fetch(`${SEARCH_BASE_URL}/GET_search_line_items_history`);
  if (!response.ok) {
    throw new Error("Failed to fetch search line item history");
  }
  return response.json();
}

export async function getSearchBurstHistory() {
  const response = await fetch(`${SEARCH_BASE_URL}/GET_search_bursts_history`);
  if (!response.ok) {
    throw new Error("Failed to fetch search burst history");
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
    const response = await fetch(`${CLIENTS_BASE_URL}/get_clients?id=${clientId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch client information");
    }
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No client data found");
    }

    const clientInfo = data[0];

    if (typeof clientInfo.feesearch !== "number") {
      console.warn("feesearch is not a number:", clientInfo.feesearch);
      clientInfo.feesearch = 0;
    }

    return clientInfo;
  } catch (error) {
    console.error("Error fetching client info:", error);
    return null;
  }
}

// --- NEW VERSIONED SAVE FUNCTION ---
export async function createMediaPlanVersioned(
  mediaPlanData: MediaPlan,
  versionData: Omit<MediaPlanVersion, 'media_plan_id'>
): Promise<{ mediaPlan: any; version: any }> {

  // Step 1: Create the main media_plan record
  const planResponse = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mediaPlanData),
  });

  if (!planResponse.ok) {
    const error = await planResponse.json();
    throw new Error(`Failed to create media plan: ${error.message}`);
  }
  const newMediaPlan = await planResponse.json();

  // Step 2: Create the media_plan_version record, linking it to the plan created above
  const versionPayload = {
    ...versionData,
    media_plan_id: newMediaPlan.id, // Use the ID from the Step 1 response
  };

  const versionResponse = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_version`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(versionPayload),
  });

  if (!versionResponse.ok) {
    const error = await versionResponse.json();
    // Optional: Add logic here to delete the `media_plan` from step 1 for cleanup.
    throw new Error(`Failed to create media plan version: ${error.message}`);
  }
  const newVersion = await versionResponse.json();

  // Step 3: Update the main media_plan with the latest_version_id using the PUT URL
  const updateResponse = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan/${newMediaPlan.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latest_version_id: newVersion.id }),
  });

   if (!updateResponse.ok) {
    const error = await updateResponse.json();
    // If this fails, the plan is created but not linked to the latest version.
    // You may want to log this as a non-critical error.
    console.warn(`Could not set latest_version_id for media_plan ${newMediaPlan.id}: ${error.message}`);
  }

  return { mediaPlan: newMediaPlan, version: newVersion };
}


export async function getMediaPlans() {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan`);
  if (!response.ok) {
    throw new Error("Failed to fetch media plans");
  }
  return response.json();
}

export async function editMediaPlan(id: string, data: any) {
  const response = await fetch(`${MEDIA_PLANS_BASE_URL}/media_plan_${id}`, {
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

