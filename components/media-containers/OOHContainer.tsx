"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { OOH_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

/** No raw-lines callback: a page saves OOH's save rows only (C-377 lesson, W5k). */
type OohContainerProps = Omit<MediaChannelContainerHookProps, "feePct" | "onRawLineItemsChange"> & {
  feeooh: number
}

export default function OohContainer({ feeooh, ...rest }: OohContainerProps) {
  return <MediaChannelContainer config={OOH_CONTAINER_CONFIG} feePct={feeooh} {...rest} />
}
