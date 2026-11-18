"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { DIGITALAUDIO_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type DigitalAudioContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
> & { feedigiaudio: number }

export default function DigitalAudioContainer({
  feedigiaudio,
  ...rest
}: DigitalAudioContainerProps) {
  return (
    <MediaChannelContainer
      config={DIGITALAUDIO_CONTAINER_CONFIG}
      feePct={feedigiaudio}
      {...rest}
    />
  )
}
