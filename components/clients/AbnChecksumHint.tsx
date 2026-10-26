"use client"

import { abnChecksumWarning } from "@/lib/clients/abn"

/**
 * Non-blocking ABN warning under the ABN field: shows only when the value is
 * 11 digits and fails the ATO mod-89 check digit. The save is not blocked.
 */
export function AbnChecksumHint({ value }: { value: unknown }) {
  const warning = abnChecksumWarning(value)
  if (!warning) return null
  return (
    <p role="status" className="text-sm text-warning-foreground">
      {warning}
    </p>
  )
}
