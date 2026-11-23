"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { PRODUCTION_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

/**
 * No fee prop: Production carries no agency fee (`feePct` is 0, as the old
 * container hardcoded it). No raw-lines callback: a page saves Production's
 * save rows only (C-377 lesson, W5j).
 */
type ProductionContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
>

export default function ProductionContainer(props: ProductionContainerProps) {
  return <MediaChannelContainer config={PRODUCTION_CONTAINER_CONFIG} feePct={0} {...props} />
}
