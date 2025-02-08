const SEARCH_BASE_URL = process.env.XANO_SEARCH_BASE_URL
const PUBLISHERS_BASE_URL = process.env.XANO_PUBLISHERS_BASE_URL
const CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL
const MEDIAPLAN_BASE_URL = process.env.XANO_MEDIAPLAN_BASE_URL

export async function getSearchLineItems() {
  const response = await fetch(`${SEARCH_BASE_URL}/GET_search_line_items`)
  if (!response.ok) {
    throw new Error("Failed to fetch search line items")
  }
  return response.json()
}

export async function createSearchLineItem(data: any) {
  const response = await fetch(`${SEARCH_BASE_URL}/POST_search_line_items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error("Failed to create search line item")
  }
  return response.json()
}

export async function createSearchBurst(data: any) {
  const response = await fetch(`${SEARCH_BASE_URL}/POST_search_bursts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error("Failed to create search burst")
  }
  return response.json()
}

export async function getSearchLineItemHistory() {
  const response = await fetch(`${SEARCH_BASE_URL}/GET_search_line_items_history`)
  if (!response.ok) {
    throw new Error("Failed to fetch search line item history")
  }
  return response.json()
}

export async function getSearchBurstHistory() {
  const response = await fetch(`${SEARCH_BASE_URL}/GET_search_bursts_history`)
  if (!response.ok) {
    throw new Error("Failed to fetch search burst history")
  }
  return response.json()
}

export async function getPublishersForSearch() {
  const response = await fetch(`${PUBLISHERS_BASE_URL}/get_publishers`)
  if (!response.ok) {
    throw new Error("Failed to fetch publishers for search")
  }
  const data = await response.json()
  return data
    .filter((publisher: any) => publisher.pub_search === true || publisher.pub_search === 1)
    .map((publisher: any) => ({
      id: publisher.id,
      publisher_name: publisher.publisher_name,
    }))
}

export async function getClientInfo(clientId: string) {
  const response = await fetch(`${CLIENTS_BASE_URL}/get_clients?id=${clientId}`)
  if (!response.ok) {
    throw new Error("Failed to fetch client information")
  }
  const data = await response.json()
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No client data found")
  }
  const clientInfo = data[0]
  if (typeof clientInfo.feesearch !== "number") {
    console.warn("feesearch is not a number:", clientInfo.feesearch)
    clientInfo.feesearch = 0 // Set a default value if feesearch is not a number
  }
  return clientInfo
}

export async function createMediaPlan(data: any) {
  const response = await fetch(`${MEDIAPLAN_BASE_URL}/post_mediaplan_topline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error("Failed to create media plan")
  }
  return response.json()
}

export async function getMediaPlans() {
  const response = await fetch(`${MEDIAPLAN_BASE_URL}/get_mediaplan_topline`)
  if (!response.ok) {
    throw new Error("Failed to fetch media plans")
  }
  return response.json()
}

export async function editMediaPlan(id: string, data: any) {
  const response = await fetch(`${MEDIAPLAN_BASE_URL}/edit_mediaplan_topline/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error("Failed to edit media plan")
  }
  return response.json()
}

