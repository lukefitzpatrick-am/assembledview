/**
 * Copy text to the clipboard with a document.execCommand fallback when the
 * Clipboard API is missing or blocked (non-secure contexts, denied permission).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to legacy path
    }
  }

  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.left = "-9999px"
    ta.style.top = "0"
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
