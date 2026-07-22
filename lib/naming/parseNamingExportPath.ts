const NAMING_EXPORT_PREFIX = "exports/naming/"

/**
 * Validate `exports/naming/<mba>/...` pathnames. Rejects traversal, absolute paths,
 * and anything outside the naming export prefix.
 */
export function parseNamingExportPath(
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
    !pathname.startsWith(NAMING_EXPORT_PREFIX)
  ) {
    return null
  }

  const rest = pathname.slice(NAMING_EXPORT_PREFIX.length)
  const slash = rest.indexOf("/")
  if (slash <= 0) return null

  const mba = rest.slice(0, slash)
  const filePart = rest.slice(slash + 1)
  if (!mba || !filePart || mba.includes("/") || filePart.includes("..")) {
    return null
  }

  return { pathname, mba }
}

export { NAMING_EXPORT_PREFIX }
