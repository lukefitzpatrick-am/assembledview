"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { BVOD_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type BVODContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
> & { feebvod: number }

export default function BVODContainer({ feebvod, ...rest }: BVODContainerProps) {
  return <MediaChannelContainer config={BVOD_CONTAINER_CONFIG} feePct={feebvod} {...rest} />
}
