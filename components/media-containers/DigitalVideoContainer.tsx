"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { DIGITALVIDEO_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type DigitalVideoContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
> & { feedigivideo: number }

export default function DigitalVideoContainer({
  feedigivideo,
  ...rest
}: DigitalVideoContainerProps) {
  return (
    <MediaChannelContainer
      config={DIGITALVIDEO_CONTAINER_CONFIG}
      feePct={feedigivideo}
      {...rest}
    />
  )
}
