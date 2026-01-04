"use client"

interface CampaignTimeChartProps {
  timeElapsed: number
  daysInCampaign?: number
  daysElapsed?: number
  daysRemaining?: number
}

export default function CampaignTimeChart({ timeElapsed, daysInCampaign, daysElapsed, daysRemaining }: CampaignTimeChartProps) {
  const getColor = (value: number) => {
    if (value >= 100) return '#ef4444' // red
    if (value >= 75) return '#f59e0b' // amber
    if (value >= 50) return '#3b82f6' // blue
    return '#10b981' // green
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">Days in campaign</div>
          <div className="font-semibold">{daysInCampaign ?? '–'}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">Days elapsed</div>
          <div className="font-semibold">{daysElapsed ?? '–'}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">Days remaining</div>
          <div className="font-semibold">{daysRemaining ?? '–'}</div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium">Progress</span>
        <span className="text-lg font-bold">{timeElapsed.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, timeElapsed))}%`,
            backgroundColor: getColor(timeElapsed)
          }}
        />
      </div>
    </div>
  )
}
