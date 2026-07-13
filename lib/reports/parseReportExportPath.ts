const REPORT_EXPORT_PREFIX = "exports/reports/"

/**
 * Validate `exports/reports/<mba>/...` pathnames. Rejects traversal, absolute paths,
 * and anything outside the report export prefix.
 */
export function parseReportExportPath(
  raw: string,
): { pathname: string; mba: string } | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(raw.trim())
  } catch {
    return null
  }

  const pathname = decoded.replace(/^\/+/, "")
  if (
    !pathname ||
    pathname.includes("..") ||
    pathname.includes("\\") ||
    pathname.includes("\0") ||
    pathname.includes("//") ||
    !pathname.startsWith(REPORT_EXPORT_PREFIX)
  ) {
    return null
  }

  const rest = pathname.slice(REPORT_EXPORT_PREFIX.length)
  const slash = rest.indexOf("/")
  if (slash <= 0) return null

  const mba = rest.slice(0, slash)
  const filePart = rest.slice(slash + 1)
  if (!mba || !filePart || mba.includes("/") || filePart.includes("..")) {
    return null
  }

  return { pathname, mba }
}
