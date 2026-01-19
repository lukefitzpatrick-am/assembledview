import axios from "axios"

/**
 * Fetch all pages from a Xano endpoint using either page/page_size or offset/limit.
 * Sends both styles of pagination params to maximize compatibility.
 */
export async function fetchAllXanoPages(
  baseUrl: string,
  baseParams: Record<string, string | number | boolean | null | undefined> = {},
  label = "xano",
  pageSize = 200,
  maxPages = 50
): Promise<any[]> {
  const results: any[] = []
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams()
    Object.entries(baseParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, String(value))
      }
    })

    // Send both pagination styles; Xano will ignore the unused one.
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    params.set("offset", String((page - 1) * pageSize))
    params.set("limit", String(pageSize))

    const url = `${baseUrl}?${params.toString()}`

    try {
      const response = await axios.get(url, { headers, timeout: 15000 })
      const data = Array.isArray(response.data) ? response.data : []
      results.push(...data)

      if (data.length < pageSize) {
        break
      }
    } catch (error: any) {
      // Treat 404 as empty, otherwise log and stop.
      const status = error?.response?.status
      if (status === 404) {
        break
      }

      console.warn(
        `[${label}] Pagination request failed on page ${page}:`,
        status || "",
        error?.message || error
      )
      break
    }
  }

  return results
}
