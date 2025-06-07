const SEARCH_BASE_URL = process.env.XANO_SEARCH_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:TMcVkd1X"
const PUBLISHERS_BASE_URL = process.env.XANO_PUBLISHERS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:YkRK8qLP"
const CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const MEDIAPLAN_BASE_URL = process.env.XANO_MEDIAPLAN_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"
const MEDIA_DETAILS_BASE_URL = process.env.XANO_MEDIA_DETAILS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:di-s-JRc" 
const CARBONE_API_KEY = process.env.NEXT_PUBLIC_CARBONE_API_KEY || "eyJhbGciOiJFUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIxMDc3ODE4NDc5OTkwODY3NDA0IiwiYXVkIjoiY2FyYm9uZSIsImV4cCI6MjQwMDIwMTE3NiwiZGF0YSI6eyJ0eXBlIjoidGVzdCJ9fQ.APibiN9Cnwxx7NnO7BhxQvwroiv8M2NGoETOws7XHLuSLemaqvY-gyiORMbhDbRhO_BiOUU30PfWS__ZrgpbNlveAF03yoaLYDHmyMenGLLpjXQ5rfWTek0nPPETctY1YUn5qh7pMcZmlwjSm46UFpk5oy_jVlA9Xz2T-OE9KIIbk9TS" // Use a real API key
const CARBONE_RENDER_URL = "https://api.carbone.io/render";

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

export async function createMediaPlan(data: any) {
  const response = await fetch(`${MEDIAPLAN_BASE_URL}/post_mediaplan_topline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to create media plan");
  }
  return response.json();
}

export async function getMediaPlans() {
  const response = await fetch(`${MEDIAPLAN_BASE_URL}/get_mediaplan_topline`);
  if (!response.ok) {
    throw new Error("Failed to fetch media plans");
  }
  return response.json();
}

export async function editMediaPlan(id: string, data: any) {
  const response = await fetch(`${MEDIAPLAN_BASE_URL}/edit_mediaplan_topline/${id}`, {
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

const API_KEY = process.env.NEXT_PUBLIC_CARBONE_API_KEY;

if (!API_KEY) {
  throw new Error("❌ Carbone API key is missing! Set NEXT_PUBLIC_CARBONE_API_KEY in environment variables.");
}

export const carboneAPI = {
  render: async (templateId: string, jsonData: any) => {
    const response = await fetch("https://api.carbone.io/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ templateId, data: jsonData, convertTo: "pdf" }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Carbone API error: ${data.error}`);
    }
    
    return data;
  },
};

console.log("🔍 Carbone API Key:", process.env.NEXT_PUBLIC_CARBONE_API_KEY);