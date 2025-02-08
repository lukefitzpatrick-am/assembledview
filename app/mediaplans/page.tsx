import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"

export default function MediaPlans() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">MediaPlans</h1>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create MediaPlan
        </Button>
      </div>
      {/* Add table or grid of media plans here */}
    </div>
  )
}

