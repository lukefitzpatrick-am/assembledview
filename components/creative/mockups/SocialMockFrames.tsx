"use client"

import type { CreativeAsset } from "@/lib/creative/types"
import type { MockTemplateId } from "./mockTemplates"
import { FacebookFeedAd } from "./social/FacebookFeedAd"
import { InstagramFeedAd } from "./social/InstagramFeedAd"
import { InstagramStoryAd } from "./social/InstagramStoryAd"
import { TikTokAd } from "./social/TikTokAd"
import type { SocialAdCopy } from "./social/types"

export type { SocialAdCopy } from "./social/types"
export {
  SOCIAL_CTA_OPTIONS,
  createDefaultSocialAdCopy,
  DEFAULT_CTA_LABEL,
  DEFAULT_DISPLAY_LINK,
  DEFAULT_DESTINATION_URL,
} from "./social/types"

type SocialMockFramesProps = {
  templateId: Extract<
    MockTemplateId,
    "facebook-feed" | "instagram-feed" | "instagram-story" | "tiktok"
  >
  copy: SocialAdCopy
  asset: CreativeAsset
  metaPageId?: string
}

export function SocialMockFrames({ templateId, copy, asset, metaPageId }: SocialMockFramesProps) {
  switch (templateId) {
    case "facebook-feed":
      return <FacebookFeedAd copy={copy} asset={asset} metaPageId={metaPageId} />
    case "instagram-feed":
      return <InstagramFeedAd copy={copy} asset={asset} metaPageId={metaPageId} />
    case "instagram-story":
      return <InstagramStoryAd copy={copy} asset={asset} metaPageId={metaPageId} />
    case "tiktok":
      // TikTok uses a different platform identity — keep initials, not Meta page avatars.
      return <TikTokAd copy={copy} asset={asset} />
    default:
      return null
  }
}
