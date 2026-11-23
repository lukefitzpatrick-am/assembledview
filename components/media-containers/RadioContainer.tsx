"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { RADIO_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type RadioContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
> & { feeradio: number }

export default function RadioContainer({ feeradio, ...rest }: RadioContainerProps) {
  return <MediaChannelContainer config={RADIO_CONTAINER_CONFIG} feePct={feeradio} {...rest} />
}
