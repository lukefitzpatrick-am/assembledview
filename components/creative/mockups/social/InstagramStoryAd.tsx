"use client"

import { ChevronUp } from "lucide-react"

import type { CreativeAsset } from "@/lib/creative/types"
import { InstagramStoryShell } from "./FeedShells"
import { BrandAvatar, InertCta, StoryMedia } from "./shared"
import type { SocialAdCopy } from "./types"

type Props = {
  copy: SocialAdCopy
  asset: CreativeAsset
}

export function InstagramStoryAd({ copy, asset }: Props) {
  const brand = copy.brandName.trim() || "Brand"
  const username = brand.replace(/\s+/g, "").toLowerCase() || "brand"

  return (
    <InstagramStoryShell>
      <article className="mx-auto w-full max-w-[320px] overflow-hidden rounded-frame border border-border bg-foreground shadow-e2">
        <div className="relative aspect-[9/16] w-full">
          <StoryMedia asset={asset} />

          <div className="absolute inset-x-0 top-0 z-20 px-3 pb-10 pt-3">
            <div className="mb-3 h-0.5 overflow-hidden rounded-pill bg-background/30">
              <div className="h-full w-2/5 rounded-pill bg-background" />
            </div>
            <div className="flex items-center gap-2">
              <BrandAvatar name={brand} size="sm" />
              <p className="truncate text-sm font-semibold lowercase text-background">{username}</p>
              <span className="rounded-input bg-background/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
                Sponsored
              </span>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-4 pb-5 pt-16">
            <ChevronUp className="h-5 w-5 text-background" strokeWidth={1.8} aria-hidden />
            <InertCta
              destinationUrl={copy.destinationUrl}
              className="w-full max-w-[260px] rounded-pill border border-background/40 bg-background/15 px-4 py-2.5 text-center text-sm font-semibold text-background backdrop-blur-sm"
            >
              {copy.ctaLabel}
            </InertCta>
          </div>
        </div>
      </article>
    </InstagramStoryShell>
  )
}
