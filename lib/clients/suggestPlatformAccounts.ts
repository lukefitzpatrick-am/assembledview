/**
 * Case-insensitive name match from a client to CM360 / DV360 advertiser names.
 * No database or Snowflake access. The script prints the CSV; people enter the rows.
 */

export type AdvertiserCandidate = {
  platform: "cm360" | "dv360"
  advertiserName: string
}

export type ClientNameRow = {
  clientName: string
  mbaidentifier: string
}

export type PlatformAccountSuggestion = {
  clientName: string
  mbaidentifier: string
  platform: "cm360" | "dv360"
  advertiserName: string
  score: number
}

const MIN_SCORE = 0.55

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function tokens(value: string): string[] {
  return squash(value).split(/\s+/).filter((token) => token.length >= 3)
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const grid: number[] = new Array(cols)
  for (let col = 0; col < cols; col++) grid[col] = col
  for (let row = 1; row < rows; row++) {
    let previous = grid[0]
    grid[0] = row
    for (let col = 1; col < cols; col++) {
      const current = grid[col]
      const cost = a[row - 1] === b[col - 1] ? 0 : 1
      grid[col] = Math.min(grid[col] + 1, grid[col - 1] + 1, previous + cost)
      previous = current
    }
  }
  return grid[cols - 1] ?? 0
}

function ratio(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

/** 1 is an exact squash match. Below 0.55 is not a suggestion. */
export function advertiserMatchScore(clientName: string, advertiserName: string): number {
  const left = squash(clientName)
  const right = squash(advertiserName)
  if (!left || !right) return 0
  if (left === right) return 1
  const shorter = left.length <= right.length ? left : right
  const longer = shorter === left ? right : left
  if (shorter.length >= 4 && longer.includes(shorter)) return 0.92

  let best = 0
  for (const clientToken of tokens(clientName)) {
    for (const advertiserToken of tokens(advertiserName)) {
      // A shared word is strong. Only the whole name scores 1.
      const tokenScore = clientToken === advertiserToken ? 0.95 : ratio(clientToken, advertiserToken)
      best = Math.max(best, tokenScore)
    }
  }
  return best
}

export function suggestPlatformAccounts(
  clientRows: readonly ClientNameRow[],
  advertisers: readonly AdvertiserCandidate[],
): PlatformAccountSuggestion[] {
  const suggestions: PlatformAccountSuggestion[] = []
  for (const client of clientRows) {
    const ranked = advertisers
      .map((advertiser) => ({
        advertiser,
        score: advertiserMatchScore(client.clientName, advertiser.advertiserName),
      }))
      .filter((row) => row.score >= MIN_SCORE)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.advertiser.advertiserName.localeCompare(b.advertiser.advertiserName)
      })
      .slice(0, 2)

    for (const row of ranked) {
      suggestions.push({
        clientName: client.clientName,
        mbaidentifier: client.mbaidentifier,
        platform: row.advertiser.platform,
        advertiserName: row.advertiser.advertiserName,
        score: Number(row.score.toFixed(3)),
      })
    }
  }
  return suggestions
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function formatSuggestionCsv(rows: readonly PlatformAccountSuggestion[]): string {
  const lines = ["client_name,mbaidentifier,platform,advertiser_name,score"]
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.clientName),
        csvCell(row.mbaidentifier),
        csvCell(row.platform),
        csvCell(row.advertiserName),
        row.score.toFixed(3),
      ].join(","),
    )
  }
  return `${lines.join("\n")}\n`
}
