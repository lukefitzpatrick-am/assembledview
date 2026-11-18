"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { DIGITALDISPLAY_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type DigitalDisplayContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
> & { feedigidisplay: number }

export default function DigitalDisplayContainer({
  feedigidisplay,
  ...rest
}: DigitalDisplayContainerProps) {
  return (
    <MediaChannelContainer
      config={DIGITALDISPLAY_CONTAINER_CONFIG}
      feePct={feedigidisplay}
      {...rest}
    />
  )
}
