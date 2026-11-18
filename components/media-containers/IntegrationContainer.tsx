"use client"

import MediaChannelContainer from "@/components/media-containers/MediaChannelContainer"
import { INTEGRATION_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import type { MediaChannelContainerHookProps } from "@/lib/mediaplan/useMediaChannelContainer"

type IntegrationContainerProps = Omit<
  MediaChannelContainerHookProps,
  "feePct" | "onRawLineItemsChange"
> & { feeintegration: number }

export default function IntegrationContainer({
  feeintegration,
  ...rest
}: IntegrationContainerProps) {
  return (
    <MediaChannelContainer
      config={INTEGRATION_CONTAINER_CONFIG}
      feePct={feeintegration}
      {...rest}
    />
  )
}
