"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { TELEVISION_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type TelevisionContainerProps = Omit<MediaChannelContainerHookProps, "feePct" | "onRawLineItemsChange"> & {
  feetelevision: number
  /** The raw form lines on every change (edit passes the save rows' handler, C-377). */
  onTelevisionLineItemsChange: (lineItems: unknown[]) => void
}

export default function TelevisionContainer({ feetelevision, onTelevisionLineItemsChange, ...rest }: TelevisionContainerProps) {
  return (
    <MediaChannelContainer
      config={TELEVISION_CONTAINER_CONFIG}
      feePct={feetelevision}
      onRawLineItemsChange={onTelevisionLineItemsChange}
      {...rest}
    />
  )
}
