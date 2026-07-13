"use client"

import { Button } from "@/components/ui/button"
import { openAvaChat } from "@/lib/assistantBridge"
import { useAuthContext } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"

type AvaSkillActionProps = {
  label: string
  message: string
  className?: string
  variant?: "outline" | "ghost" | "secondary"
  size?: "sm" | "default"
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
}: AvaSkillActionProps) {
  const { isAdmin, isLoading } = useAuthContext()
  if (isLoading || !isAdmin) return null

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("text-xs", className)}
      onClick={() => openAvaChat({ message })}
    >
      {label}
    </Button>
  )
}
