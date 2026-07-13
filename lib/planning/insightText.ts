/** Pull HEADLINE + first two bullet-ish findings from insight markdown. */
export function summariseInsight(insight: string | null | undefined): {
  headline: string | null
  findings: string[]
  reachArchitecture: string | null
} {
  if (!insight?.trim()) {
    return { headline: null, findings: [], reachArchitecture: null }
  }
  const lines = insight
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  let headline: string | null = null
  const findings: string[] = []
  let reachArchitecture: string | null = null
  let section: string | null = null

  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper.startsWith("HEADLINE")) {
      section = "headline"
      const rest = line.replace(/^HEADLINE[:\s]*/i, "").trim()
      if (rest) headline = rest
      continue
    }
    if (upper.startsWith("WHAT STANDS OUT")) {
      section = "stands"
      continue
    }
    if (upper.startsWith("REACH ARCHITECTURE")) {
      section = "reach"
      continue
    }
    if (
      upper.startsWith("CREATIVE") ||
      upper.startsWith("WATCH-OUTS") ||
      upper.startsWith("WATCH OUTS")
    ) {
      section = "other"
      continue
    }
    const cleaned = line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "")
    if (section === "headline" && !headline) headline = cleaned
    else if (section === "stands" && findings.length < 2) findings.push(cleaned)
    else if (section === "reach" && !reachArchitecture) reachArchitecture = cleaned
  }

  if (!headline) headline = lines[0] ?? null
  return { headline, findings, reachArchitecture }
}
