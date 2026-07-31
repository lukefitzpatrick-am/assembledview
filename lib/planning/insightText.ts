/**
 * Pull THE HEADLINE / HEADLINE + first two findings from insight markdown.
 * Skill format leads with `AUDIENCE:` then `THE HEADLINE` — never treat the
 * audience-definition line as the headline.
 */
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
    // Skill uses "THE HEADLINE"; also accept bare "HEADLINE: …".
    if (upper === "THE HEADLINE" || upper.startsWith("THE HEADLINE:") || /^HEADLINE\b/.test(upper)) {
      section = "headline"
      const rest = line
        .replace(/^THE\s+HEADLINE[:\s]*/i, "")
        .replace(/^HEADLINE[:\s]*/i, "")
        .trim()
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
      upper.startsWith("AUDIENCE:") ||
      upper.startsWith("AUDIENCE ") ||
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

  // Do not fall back to lines[0] — that is usually the AUDIENCE definition.
  return { headline, findings, reachArchitecture }
}
