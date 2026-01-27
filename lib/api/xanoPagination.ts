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
  const seenKeys = new Set<string>()
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }

  const buildKey = (item: any): string => {
    if (!item || typeof item !== "object") {
      return `primitive:${String(item)}`
    }

    const id =
      (item as any).id ??
      (item as any).ID ??
      (item as any)._id ??
      (item as any).Id
    if (id !== null && id !== undefined && String(id).trim() !== "") {
      return `id:${String(id)}`
    }

    const lineItemId = (item as any).line_item_id ?? (item as any).lineItemId
    if (lineItemId && String(lineItemId).trim() !== "") {
      return `line_item_id:${String(lineItemId)}`
    }

    // Fallback: use a small subset of common identity-ish fields. This avoids
    // hashing the whole object (which can be large and unstable across runs).
    const mba = (item as any).mba_number ?? (item as any).mbaNumber ?? ""
    const version =
      (item as any).media_plan_version ??
      (item as any).media_plan_version_id ??
      (item as any).version_number ??
      (item as any).mp_plannumber ??
      ""

    const network = (item as any).network ?? ""
    const station = (item as any).station ?? (item as any).site ?? ""
    const market = (item as any).market ?? ""

    return `fallback:${String(mba)}|${String(version)}|${String(network)}|${String(station)}|${String(market)}`
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
      if (data.length === 0) {
        break
      }

      // Some Xano endpoints ignore pagination params and return the same page repeatedly.
      // Dedupe across pages and stop early when we see no new unique items.
      let addedThisPage = 0
      for (const item of data) {
        const key = buildKey(item)
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        results.push(item)
        addedThisPage++
      }

      if (page > 1 && addedThisPage === 0) {
        // We received a page, but nothing new was added => pagination likely ignored.
        // Stop to avoid duplicating the same records over and over.
        console.warn(`[${label}] Pagination appears unsupported; stopping early after page ${page}`)
        break
      }

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
