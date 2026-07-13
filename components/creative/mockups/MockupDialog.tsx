"use client"

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import type { LineItemOption } from "@/lib/creative/lineItemOptions"
import type { CreativeAsset } from "@/lib/creative/types"
import {
  CopyChatPanel,
  SocialAdDetailsForm,
  type AdCopyPlatform,
} from "./copychat/CopyChatPanel"
import { LivePageMockup } from "./LivePageMockup"
import { MOCK_TEMPLATES, type MockTemplateId, getMockTemplate } from "./mockTemplates"
import { TvSceneMockup } from "./scenes/TvSceneMockup"
import {
  SocialMockFrames,
  createDefaultSocialAdCopy,
  type SocialAdCopy,
} from "./SocialMockFrames"
import { WebPageMockTemplates } from "./WebPageMockTemplates"

type MockupDialogProps = {
  asset: CreativeAsset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultBrandName: string
  clientName?: string
  campaignName?: string
  mbaNumber?: string
  socialLineItems?: LineItemOption[]
  /** Client Meta page id (`idmeta`) for FB/IG avatars. */
  metaPageId?: string
}

function socialPlatformFromTemplate(templateId: MockTemplateId): AdCopyPlatform | null {
  if (
    templateId === "facebook-feed" ||
    templateId === "instagram-feed" ||
    templateId === "instagram-story" ||
    templateId === "tiktok"
  ) {
    return templateId
  }
  return null
}

export function MockupDialog({
  asset,
  open,
  onOpenChange,
  defaultBrandName,
  clientName,
  campaignName,
  mbaNumber,
  socialLineItems = [],
  metaPageId,
}: MockupDialogProps) {
  const [templateId, setTemplateId] = useState<MockTemplateId>("facebook-feed")
  const [adCopy, setAdCopy] = useState<SocialAdCopy>(() =>
    createDefaultSocialAdCopy(defaultBrandName),
  )

  const template = getMockTemplate(templateId)
  const isSocial = template.kind === "social"
  const isLive = template.kind === "live"
  const isWebpage = template.kind === "webpage"
  const isScene = template.kind === "scene"
  const socialPlatform = socialPlatformFromTemplate(templateId)
  const showSocialRail = Boolean(isSocial && asset && socialPlatform)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && asset) {
          setAdCopy(createDefaultSocialAdCopy(defaultBrandName))
          setTemplateId(
            asset.mime_type === "application/zip" ? "news-article" : "facebook-feed",
          )
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-3 border-b border-border px-6 py-4 text-left">
          <div>
            <DialogTitle>Creative mockup</DialogTitle>
            <DialogDescription>
              {asset
                ? `Preview “${asset.asset_name}” in social, webpage, TV scene, or live-page frames.`
                : "Preview creative in social, webpage, TV scene, or live-page frames."}
            </DialogDescription>
          </div>

          <div className="overflow-x-auto pb-1">
            <Segmented
              value={templateId}
              onValueChange={(value) => {
                if (!value) return
                setTemplateId(value as MockTemplateId)
              }}
              className="w-max"
            >
              {MOCK_TEMPLATES.map((item) => (
                <SegmentedItem key={item.id} value={item.id}>
                  {item.label}
                </SegmentedItem>
              ))}
            </Segmented>
          </div>
        </DialogHeader>

        {showSocialRail && asset && socialPlatform ? (
          <>
            {/* xl+: three floating cards on one canvas */}
            <div className="hidden min-h-0 flex-1 overflow-auto bg-background px-4 py-6 xl:block sm:px-8">
              <div className="flex items-start justify-center gap-6">
                <div className="shrink-0">
                  <SocialMockFrames
                    templateId={
                      templateId as
                        | "facebook-feed"
                        | "instagram-feed"
                        | "instagram-story"
                        | "tiktok"
                    }
                    copy={adCopy}
                    asset={asset}
                    metaPageId={metaPageId}
                  />
                </div>

                <aside className="w-[300px] shrink-0 rounded-card border border-border bg-card p-4 shadow-e1">
                  <p className="mb-3 text-sm font-medium text-foreground">Ad details</p>
                  <SocialAdDetailsForm
                    copy={adCopy}
                    onChange={setAdCopy}
                    showDescription={templateId === "facebook-feed"}
                  />
                </aside>

                <aside className="flex max-h-[80vh] w-[380px] shrink-0 flex-col overflow-hidden rounded-card border border-border bg-card shadow-e1">
                  <CopyChatPanel
                    asset={asset}
                    platform={socialPlatform}
                    copy={adCopy}
                    onChange={setAdCopy}
                    showDescription={templateId === "facebook-feed"}
                    clientName={clientName}
                    campaignName={campaignName}
                    mbaNumber={mbaNumber}
                    socialLineItems={socialLineItems}
                    hideDetailsAccordion
                    className="max-h-[80vh]"
                  />
                </aside>
              </div>
            </div>

            {/* Below xl: stacked mock + accordion/chat */}
            <div className="flex min-h-0 flex-1 flex-col xl:hidden lg:flex-row">
              <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-background px-4 py-6 sm:px-8">
                <SocialMockFrames
                  templateId={
                    templateId as
                      | "facebook-feed"
                      | "instagram-feed"
                      | "instagram-story"
                      | "tiktok"
                  }
                  copy={adCopy}
                  asset={asset}
                  metaPageId={metaPageId}
                />
              </div>
              <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-border bg-surface-panel lg:w-[400px] lg:border-l lg:border-t-0">
                <CopyChatPanel
                  asset={asset}
                  platform={socialPlatform}
                  copy={adCopy}
                  onChange={setAdCopy}
                  showDescription={templateId === "facebook-feed"}
                  clientName={clientName}
                  campaignName={campaignName}
                  mbaNumber={mbaNumber}
                  socialLineItems={socialLineItems}
                />
              </aside>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto bg-background px-4 py-6 sm:px-8">
            {asset ? (
              isLive ? (
                <LivePageMockup
                  asset={asset}
                  onUseBuiltInTemplates={() => setTemplateId("news-article")}
                />
              ) : isScene ? (
                <TvSceneMockup asset={asset} />
              ) : isWebpage ? (
                <WebPageMockTemplates
                  templateId={templateId as "news-article" | "homepage"}
                  asset={asset}
                />
              ) : isSocial && socialPlatform ? (
                <SocialMockFrames
                  templateId={
                    templateId as
                      | "facebook-feed"
                      | "instagram-feed"
                      | "instagram-story"
                      | "tiktok"
                  }
                  copy={adCopy}
                  asset={asset}
                  metaPageId={metaPageId}
                />
              ) : null
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
