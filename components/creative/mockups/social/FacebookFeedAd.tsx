"use client"

import {
  Globe,
  MessageCircle,
  Share2,
  ThumbsUp,
} from "lucide-react"

import type { CreativeAsset } from "@/lib/creative/types"
import { FacebookFeedShell } from "./FeedShells"
import {
  BrandAvatar,
  FeedMedia,
  InertCta,
  formatDisplayLink,
  truncateWithMore,
} from "./shared"
import type { SocialAdCopy } from "./types"

type Props = {
  copy: SocialAdCopy
  asset: CreativeAsset
  metaPageId?: string
}

export function FacebookFeedAd({ copy, asset, metaPageId }: Props) {
  const brand = copy.brandName.trim() || "Brand"
  const primary = truncateWithMore(copy.primaryText, 125, "See more")
  const link = formatDisplayLink(copy.displayLink)

  return (
    <FacebookFeedShell>
      <article className="w-full bg-card">
        <header className="flex items-center gap-3 px-4 py-3">
          <BrandAvatar name={brand} metaPageId={metaPageId} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{brand}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Sponsored</span>
              <span aria-hidden>·</span>
              <Globe className="h-3 w-3" aria-hidden strokeWidth={1.8} />
            </p>
          </div>
        </header>

        {copy.primaryText ? (
          <p className="whitespace-pre-wrap px-4 pb-3 text-sm text-foreground">
            {primary.visible}
            {primary.truncated ? (
              <>
                {" "}
                <span className="text-muted-foreground">{primary.moreLabel}</span>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="aspect-[4/5] w-full max-h-[600px] bg-muted">
          <FeedMedia asset={asset} />
        </div>

        {(link || copy.headline || copy.description || copy.ctaLabel) && (
          <div className="flex items-center gap-3 border-t border-border bg-muted/60 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              {link ? (
                <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {link}
                </p>
              ) : null}
              {copy.headline ? (
                <p className="truncate text-sm font-semibold text-foreground">{copy.headline}</p>
              ) : null}
              {copy.description ? (
                <p className="truncate text-xs text-muted-foreground">{copy.description}</p>
              ) : null}
            </div>
            <InertCta
              destinationUrl={copy.destinationUrl}
              className="shrink-0 rounded-input border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              {copy.ctaLabel}
            </InertCta>
          </div>
        )}

        <footer className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            Like
            <span className="num text-muted-foreground/80">128</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            Comment
            <span className="num text-muted-foreground/80">24</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Share2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            Share
            <span className="num text-muted-foreground/80">7</span>
          </span>
        </footer>
      </article>
    </FacebookFeedShell>
  )
}
