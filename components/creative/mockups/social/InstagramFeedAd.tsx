"use client"

import { Bookmark, Heart, MessageCircle, Send } from "lucide-react"

import type { CreativeAsset } from "@/lib/creative/types"
import { InstagramFeedShell } from "./FeedShells"
import {
  BrandAvatar,
  FeedMedia,
  IgGradientRing,
  InertCta,
  truncateWithMore,
} from "./shared"
import type { SocialAdCopy } from "./types"

type Props = {
  copy: SocialAdCopy
  asset: CreativeAsset
  metaPageId?: string
}

export function InstagramFeedAd({ copy, asset, metaPageId }: Props) {
  const brand = copy.brandName.trim() || "Brand"
  const username = brand.replace(/\s+/g, "").toLowerCase() || "brand"
  const caption = truncateWithMore(copy.primaryText, 90, "more")

  return (
    <InstagramFeedShell>
      <article className="w-full border-b border-border bg-card">
        <header className="flex items-center gap-2.5 px-3 py-2.5">
          <IgGradientRing>
            <BrandAvatar name={brand} size="sm" metaPageId={metaPageId} />
          </IgGradientRing>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold lowercase text-foreground">{username}</p>
            <p className="text-[11px] text-muted-foreground">Sponsored</p>
          </div>
        </header>

        <div className="aspect-[4/5] w-full max-h-[525px] bg-muted">
          <FeedMedia asset={asset} />
        </div>

        <InertCta
          destinationUrl={copy.destinationUrl}
          className="flex w-full items-center justify-between bg-channel-social px-3 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <span>{copy.ctaLabel}</span>
          <span aria-hidden>›</span>
        </InertCta>

        <div className="space-y-2 px-3 py-3">
          <div className="flex items-center justify-between text-foreground">
            <div className="flex items-center gap-4">
              <Heart className="h-5 w-5" strokeWidth={1.8} aria-hidden />
              <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden />
              <Send className="h-5 w-5" strokeWidth={1.8} aria-hidden />
            </div>
            <Bookmark className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </div>

          <p className="text-sm font-semibold text-foreground">
            <span className="num">2,481</span> likes
          </p>

          {copy.primaryText ? (
            <p className="text-sm text-foreground">
              <span className="font-semibold lowercase">{username}</span>{" "}
              <span className="whitespace-pre-wrap">{caption.visible}</span>
              {caption.truncated ? (
                <>
                  {" "}
                  <span className="text-muted-foreground">... {caption.moreLabel}</span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-sm font-semibold lowercase text-foreground">{username}</p>
          )}
        </div>
      </article>
    </InstagramFeedShell>
  )
}
