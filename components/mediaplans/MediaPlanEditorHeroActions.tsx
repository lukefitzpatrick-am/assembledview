"use client"

import Link from "next/link"
import { MoreHorizontal } from "lucide-react"

import { AVA_SKILL_MESSAGES } from "@/components/ava/AvaSkillActionSets"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthContext } from "@/contexts/AuthContext"
import { openAvaChat } from "@/lib/assistantBridge"

type MediaPlanEditorHeroActionsProps = {
  /** When set, show Creative / Trafficking navigation (edit only). */
  mbaNumber?: string
  onCopyContext: () => void
  /** Extra Ava generation actions for create (no Draft ad copy). */
  variant: "create" | "edit"
}

/**
 * Header action hierarchy for create/edit: nav links grouped apart from
 * generation actions (overflow), with Copy Context as a styled utility.
 */
export function MediaPlanEditorHeroActions({
  mbaNumber,
  onCopyContext,
  variant,
}: MediaPlanEditorHeroActionsProps) {
  const { isAdmin, isLoading } = useAuthContext()
  const showAva = !isLoading && isAdmin

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

      {showAva ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              aria-label="Generate with Ava"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              Generate
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Ava</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => openAvaChat({ message: AVA_SKILL_MESSAGES.createMi })}
            >
              Create MI for Specs
            </DropdownMenuItem>
            {variant === "edit" ? (
              <DropdownMenuItem
                onSelect={() => openAvaChat({ message: AVA_SKILL_MESSAGES.draftCopy })}
              >
                Draft ad copy
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() => openAvaChat({ message: AVA_SKILL_MESSAGES.planRationale })}
            >
              Plan rationale
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-xs"
        onClick={onCopyContext}
      >
        Copy Context
      </Button>
    </div>
  )
}
