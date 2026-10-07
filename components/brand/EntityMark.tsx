import Image from "next/image"

import { BRAND, readableTextOn } from "@/lib/brand"
import { cn } from "@/lib/utils"

const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const SIZE_PX = { sm: 20, md: 28, lg: 40 } as const

export type EntityMarkSize = keyof typeof SIZE_PX
export type EntityMarkKind = "client" | "publisher"

export interface EntityMarkProps {
  name: string
  colour?: string | null
  logoUrl?: string | null
  size?: EntityMarkSize
  kind?: EntityMarkKind
  /** When the name sits beside the mark, the mark is hidden from assistive tech. */
  nameVisible?: boolean
  className?: string
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

function fillColour(colour: string | null | undefined): string {
  const value = colour?.trim() ?? ""
  return HEX_COLOUR.test(value) ? value : BRAND.colour.context
}

/**
 * The only surface allowed to paint a client or publisher colour.
 */
export function EntityMark({
  name,
  colour,
  logoUrl,
  size = "md",
  kind = "client",
  nameVisible = true,
  className,
}: EntityMarkProps) {
  const px = SIZE_PX[size]
  const a11y = nameVisible
    ? ({ "aria-hidden": true } as const)
    : ({ "aria-label": name, role: "img" } as const)

  if (logoUrl) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 overflow-hidden rounded-input border border-border bg-am-white",
          className,
        )}
        style={{ width: px, height: px }}
        data-entity={kind}
        {...a11y}
      >
        <Image src={logoUrl} alt="" fill className="object-contain" sizes={`${px}px`} />
      </span>
    )
  }

  const fill = fillColour(colour)
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none",
        className,
      )}
      style={{
        width: px,
        height: px,
        backgroundColor: fill,
        color: readableTextOn(fill),
        fontSize: size === "sm" ? 9 : size === "md" ? 11 : 13,
      }}
      data-entity={kind}
      {...a11y}
    >
      {initials(name)}
    </span>
  )
}

export function ClientMark(props: Omit<EntityMarkProps, "kind">) {
  return <EntityMark {...props} kind="client" />
}

export function PublisherMark(props: Omit<EntityMarkProps, "kind">) {
  return <EntityMark {...props} kind="publisher" />
}
