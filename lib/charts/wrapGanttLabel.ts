/** Sideline width at the campaign gantt's ~360px gutter: 44 chars × 2 lines. */
export const GANTT_SIDELINE_MAX_CHARS = 44
export const GANTT_SIDELINE_MAX_LINES = 2

export function wrapGanttLabel(
  text: string,
  maxChars: number = GANTT_SIDELINE_MAX_CHARS,
  maxLines: number = GANTT_SIDELINE_MAX_LINES,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
      if (lines.length === maxLines - 1) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  const joined = lines.join(" ")
  if (joined.length < text.length && lines.length > 0) {
    const last = lines[lines.length - 1]!
    lines[lines.length - 1] =
      last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`
  }
  return lines
}
