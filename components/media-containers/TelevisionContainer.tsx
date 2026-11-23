"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { TELEVISION_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

/** No raw-lines callback: a page saves Television's save rows only (C-377). */
type TelevisionContainerProps = Omit<MediaChannelContainerHookProps, "feePct" | "onRawLineItemsChange"> & {
  feetelevision: number
}

export default function TelevisionContainer({ feetelevision, ...rest }: TelevisionContainerProps) {
  return <MediaChannelContainer config={TELEVISION_CONTAINER_CONFIG} feePct={feetelevision} {...rest} />
}
