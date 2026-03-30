import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClientHubSummary } from '@/lib/types/dashboard'

function hexToRgba(hex: string, alpha: number): string | null {
  if (!hex) return null
  const trimmed = hex.trim().replace('#', '')
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : trimmed
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null
  const r = Number.parseInt(expanded.slice(0, 2), 16)
  const g = Number.parseInt(expanded.slice(2, 4), 16)
  const b = Number.parseInt(expanded.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function brandStyles(brandColour?: string) {
  const valid =
    typeof brandColour === 'string' && brandColour.trim() && hexToRgba(brandColour, 1)
      ? brandColour.trim()
      : undefined
  const accentStyle = valid ? { backgroundColor: valid } : undefined
  const gradientStart = valid ? hexToRgba(valid, 0.55) : null
  const gradientMid = valid ? hexToRgba(valid, 0.22) : null
  const gradientEnd = valid ? hexToRgba(valid, 0) : null
  const gradientStyle =
    gradientStart && gradientMid && gradientEnd
      ? {
          backgroundImage: `linear-gradient(90deg, ${gradientStart} 0%, ${gradientMid} 45%, ${gradientEnd} 100%)`,
        }
      : undefined
  return { accentStyle, gradientStyle }
}

export function ClientHubCard({ row }: { row: ClientHubSummary }) {
  const { accentStyle, gradientStyle } = brandStyles(row.brandColour)

  return (
    <Link
      href={`/client/${encodeURIComponent(row.slug)}`}
      className="block focus:outline-none"
    >
      <Card className="h-full overflow-hidden rounded-3xl border border-muted/70 bg-background/90 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        {gradientStyle ? (
          <div className="h-2 rounded-t-3xl" style={gradientStyle} aria-hidden />
        ) : null}
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full bg-muted/80"
              style={accentStyle}
              aria-hidden
            />
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-lg font-semibold leading-snug line-clamp-2">
                {row.clientName}
              </CardTitle>
              <CardDescription className="text-xs">View dashboard &amp; details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Live campaigns</span>
            <span className="font-semibold tabular-nums">{row.liveCampaigns}</span>
          </div>
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">FY spend</span>
            <span className="font-semibold tabular-nums">${row.totalSpend.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
