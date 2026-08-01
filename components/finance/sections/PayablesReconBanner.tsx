import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * FN-FIX-1 gate: Costs is the only payables surface; show until recon merges.
 */
export function PayablesReconBanner() {
  return (
    <Alert className="border-pacing-critical bg-pacing-critical-bg text-status-critical-fg [&>svg]:text-status-critical-fg">
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <AlertTitle>Data quality</AlertTitle>
      <AlertDescription>
        Payables under reconciliation — do not use for month-end.
      </AlertDescription>
    </Alert>
  )
}
