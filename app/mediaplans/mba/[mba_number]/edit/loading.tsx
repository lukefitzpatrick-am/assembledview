import { Loader2 } from "lucide-react"

export default function MediaPlanEditLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      <div className="text-center">
        <h2 className="text-xl font-semibold">Loading campaign</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Preparing your media plan editor…
        </p>
      </div>
    </div>
  )
}
