"use client"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { openAvaChat } from "@/lib/assistantBridge"
import { useAuthContext } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"

type AvaSkillActionProps = {
  label: string
  message: string
  className?: string
  variant?: "outline" | "ghost" | "secondary"
  size?: "sm" | "default"
  /** When set, the control is disabled and the reason is shown in a tooltip. */
  disabledReason?: string
}

/**
 * Small staff-only control that opens Ava with a visible prewired first message.
 * Same admin gate as ChatWidget — renders nothing for non-admins.
 */
export function AvaSkillAction({
  label,
  message,
  className,
  variant = "outline",
  size = "sm",
  disabledReason,
}: AvaSkillActionProps) {
  const { isAdmin, isLoading } = useAuthContext()
  if (isLoading || !isAdmin) return null

  const disabled = Boolean(disabledReason)

  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("text-xs", className)}
      disabled={disabled}
      title={disabledReason}
      onClick={() => {
        if (disabled) return
        openAvaChat({ message })
      }}
    >
      {label}
    </Button>
  )

  if (!disabledReason) return button

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{disabledReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
