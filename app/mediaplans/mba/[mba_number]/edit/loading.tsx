import { BrandLoading } from "@/components/brand/BrandLoading"

export default function MediaPlanEditLoading() {
  return (
    <div className="flex min-h-0 flex-col items-center justify-center bg-canvas px-4 py-16">
      <BrandLoading text="Preparing your media plan editor." />
    </div>
  )
}
