"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { INFLUENCERS_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type InfluencersContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
> & { feeinfluencers: number }

export default function InfluencersContainer({
  feeinfluencers,
  ...rest
}: InfluencersContainerProps) {
  return (
    <MediaChannelContainer
      config={INFLUENCERS_CONTAINER_CONFIG}
      feePct={feeinfluencers}
      {...rest}
    />
  )
}
