/** Pull the overview text stored in client_notes.body (Fireflies JSON or plain). */
export function summaryFromNoteBody(
  body: string | null | undefined,
): string | null {
  if (!body?.trim()) return null
  try {
    const parsed = JSON.parse(body) as unknown
    if (parsed && typeof parsed === "object" && "summary" in parsed) {
      const s = String((parsed as { summary?: unknown }).summary ?? "").trim()
      return s || null
    }
  } catch {
    /* not JSON */
  }
  const plain = body.trim()
  return plain || null
}
