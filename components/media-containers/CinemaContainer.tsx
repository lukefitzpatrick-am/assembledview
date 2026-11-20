"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { CINEMA_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type CinemaContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
> & { feecinema: number }

export default function CinemaContainer({ feecinema, ...rest }: CinemaContainerProps) {
  return <MediaChannelContainer config={CINEMA_CONTAINER_CONFIG} feePct={feecinema} {...rest} />
}
