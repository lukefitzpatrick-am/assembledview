"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"

type MediaPlanEditorHeroActionsProps = {
  /** When set, show Creative / Trafficking navigation (edit only). */
  mbaNumber?: string
}

/**
 * Header action hierarchy for create/edit: Creative / Trafficking nav
 * when an MBA number is present.
 */
export function MediaPlanEditorHeroActions({
  mbaNumber,
}: MediaPlanEditorHeroActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      {mbaNumber ? (
        <div className="flex items-center gap-2" role="group" aria-label="Plan destinations">
          <Button variant="outline" size="sm" type="button" className="text-xs" asChild>
            <Link href={`/mediaplans/mba/${encodeURIComponent(mbaNumber)}/creative`}>
              Creative
            </Link>
          </Button>
          <Button variant="outline" size="sm" type="button" className="text-xs" asChild>
            <Link href={`/mediaplans/mba/${encodeURIComponent(mbaNumber)}/trafficking`}>
              Trafficking
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
