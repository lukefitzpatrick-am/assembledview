"use client"

import type { ComponentType } from "react"
import { Facebook, Globe, Instagram, Linkedin } from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { ClientLinkField } from "@/lib/types/clientProfile"
import { cn } from "@/lib/utils"

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15z" />
    </svg>
  )
}

const LINK_DEFS: Array<{
  field: ClientLinkField
  label: string
  Icon: ComponentType<{ className?: string }>
}> = [
  { field: "website", label: "Website", Icon: Globe },
  { field: "facebook_url", label: "Facebook", Icon: Facebook },
  { field: "instagram_url", label: "Instagram", Icon: Instagram },
  { field: "linkedin_url", label: "LinkedIn", Icon: Linkedin },
  { field: "tiktok_url", label: "TikTok", Icon: TikTokIcon },
]

function asUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export type ClientProfileLinksProps = {
  record?: Record<string, unknown> | null
  className?: string
}

export function ClientProfileLinks({ record, className }: ClientProfileLinksProps) {
  if (!record) return null

  const links = LINK_DEFS.flatMap(({ field, label, Icon }) => {
    const href = asUrl(record[field])
    if (!href) return []
    return [{ field, label, Icon, href }]
  })

  if (links.length === 0) return null

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className={cn("flex flex-wrap items-center gap-2", className)}
        aria-label="Client profile links"
      >
        {links.map(({ field, label, Icon, href }) => (
          <Tooltip key={field}>
            <TooltipTrigger asChild>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="interactive-tint flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-card text-muted-foreground shadow-e0 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="h-4 w-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}
