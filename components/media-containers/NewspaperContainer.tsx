"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { NEWSPAPER_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

/** No raw-lines callback: a page saves Newspaper's save rows only (C-377 lesson, W5i). */
type NewspaperContainerProps = Omit<MediaChannelContainerHookProps, "feePct" | "onRawLineItemsChange"> & {
  feenewspapers: number
}

export default function NewspaperContainer({ feenewspapers, ...rest }: NewspaperContainerProps) {
  return <MediaChannelContainer config={NEWSPAPER_CONTAINER_CONFIG} feePct={feenewspapers} {...rest} />
}
