const SEARCH_BASE_URL = process.env.XANO_SEARCH_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:TMcVkd1X"
const PUBLISHERS_BASE_URL = process.env.XANO_PUBLISHERS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:YkRK8qLP"
const CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8"
const MEDIAPLAN_BASE_URL = process.env.XANO_MEDIAPLAN_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"

export async function getSearchLineItems() {
  const response = await fetch(`${SEARCH_BASE_URL}/GET_search_line_items`);
  if (!response.ok) {
    throw new Error("Failed to fetch search line items");
  }
  return response.json();
}

export async function createSearchLineItem(data: any) {
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

export async function createSearchBurst(data: any) {
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

export async function getPublishersForSearch() {
  try {
    const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`);
    if (!response.ok) {
      throw new Error("Failed to fetch publishers for search");
    }
    const data = await response.json();
    
    // Ensure data is an array before filtering
    if (!Array.isArray(data)) return [];

    return data
      .filter((publisher: any) => Boolean(publisher.pub_search)) // Works for both `true/false` and `1/0`
      .map((publisher: any) => ({
        id: publisher.id,
        publisher_name: publisher.publisher_name,
      }));
  } catch (error) {
    console.error("Error fetching publishers for search:", error);
    return []; // Prevents app crash
  }
}

export async function getClientInfo(clientId: string) {
  try {
    const response = await fetch(`${CLIENTS_BASE_URL}/get_clients?id=${clientId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch client information");
    }
    const data = await response.json();
    
    // Ensure data is an array and contains at least one item
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("No client data found");
    }

    const clientInfo = data[0];

    // Ensure feesearch is a valid number
    if (typeof clientInfo.feesearch !== "number") {
      console.warn("feesearch is not a number:", clientInfo.feesearch);
      clientInfo.feesearch = 0; // Set a default value if it's not a number
    }

    return clientInfo;
  } catch (error) {
    console.error("Error fetching client info:", error);
    return null; // Return null if client data can't be fetched
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

import axios from "axios";

const CARBONE_API_URL = "https://api.carbone.io/";
const API_KEY = process.env.CARBONE_API_KEY;

if (!API_KEY) {
  throw new Error("❌ Carbone API key is missing! Set CARBONE_API_KEY in environment variables.");
}

export const carboneAPI = {
  generateDocument: async (templateId: string, jsonData: object) => {
    const response = await axios.post(`${CARBONE_API_URL}render/${templateId}`, { data: jsonData }, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    return response.data.data.reportId;
  },

  downloadDocument: async (reportId: string) => {
    const response = await axios.get(`${CARBONE_API_URL}report/${reportId}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      responseType: "blob",
    });

    return response.data;
  },
};
