"use client"

import type { ReactNode } from "react"
import { Bookmark, Heart, MessageCircle, Share2 } from "lucide-react"

import type { CreativeAsset } from "@/lib/creative/types"
import { TikTokFeedShell } from "./FeedShells"
import { BrandAvatar, InertCta, StoryMedia } from "./shared"
import type { SocialAdCopy } from "./types"

type Props = {
  copy: SocialAdCopy
  asset: CreativeAsset
}

function RailStat({
  icon,
  count,
}: {
  icon: ReactNode
  count: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-background">
      {icon}
      <span className="num text-[11px] font-medium">{count}</span>
    </div>
  )
}

export function TikTokAd({ copy, asset }: Props) {
  const brand = copy.brandName.trim() || "Brand"
  const username = brand.replace(/\s+/g, "").toLowerCase() || "brand"

  return (
    <TikTokFeedShell>
      <article className="relative h-full min-h-[520px] w-full overflow-hidden bg-foreground">
        <div className="absolute inset-0">
          <StoryMedia asset={asset} />
        </div>

        <div className="absolute bottom-28 right-2 z-20 flex flex-col items-center gap-4">
          <BrandAvatar name={brand} size="md" className="ring-2 ring-background" />
          <RailStat
            icon={<Heart className="h-7 w-7 fill-background" strokeWidth={1.8} aria-hidden />}
            count="12.4K"
          />
          <RailStat
            icon={<MessageCircle className="h-7 w-7" strokeWidth={1.8} aria-hidden />}
            count="842"
          />
          <RailStat
            icon={<Share2 className="h-7 w-7" strokeWidth={1.8} aria-hidden />}
            count="1.1K"
          />
          <RailStat
            icon={<Bookmark className="h-7 w-7" strokeWidth={1.8} aria-hidden />}
            count="396"
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 space-y-2 bg-gradient-to-t from-foreground/80 via-foreground/40 to-transparent px-3 pb-4 pt-20 pr-14">
          <p className="text-sm font-semibold text-background">@{username}</p>
          <span className="inline-block rounded-input bg-background/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
            Sponsored
          </span>
          {copy.primaryText ? (
            <p className="line-clamp-2 whitespace-pre-wrap text-sm text-background/90">
              {copy.primaryText}
            </p>
          ) : null}
          <p className="text-xs text-background/70">♪ Promoted music</p>
          <InertCta
            destinationUrl={copy.destinationUrl}
            className="mt-1 w-full rounded-pill bg-channel-social py-2.5 text-center text-sm font-semibold text-primary-foreground"
          >
            {copy.ctaLabel}
          </InertCta>
        </div>
      </article>
    </TikTokFeedShell>
  )
}
