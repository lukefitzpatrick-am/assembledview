"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { MAGAZINES_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

/** No raw-lines callback: a page saves Magazines' save rows only (C-377 lesson, W5j). */
type MagazinesContainerProps = Omit<MediaChannelContainerHookProps, "feePct" | "onRawLineItemsChange"> & {
  feemagazines: number
}

export default function MagazinesContainer({ feemagazines, ...rest }: MagazinesContainerProps) {
  return <MediaChannelContainer config={MAGAZINES_CONTAINER_CONFIG} feePct={feemagazines} {...rest} />
}
