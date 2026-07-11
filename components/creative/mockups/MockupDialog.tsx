"use client"

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import { Textarea } from "@/components/ui/textarea"
import type { CreativeAsset } from "@/lib/creative/types"
import { MOCK_TEMPLATES, type MockTemplateId, getMockTemplate } from "./mockTemplates"
import {
  SOCIAL_CTA_OPTIONS,
  SocialMockFrames,
  createDefaultSocialAdCopy,
  type SocialAdCopy,
} from "./SocialMockFrames"
import type { SocialCtaLabel } from "./social/types"
import { WebPageMockTemplates } from "./WebPageMockTemplates"

type MockupDialogProps = {
  asset: CreativeAsset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultBrandName: string
}

function SocialAdForm({
  copy,
  onChange,
  showDescription,
}: {
  copy: SocialAdCopy
  onChange: (next: SocialAdCopy) => void
  showDescription: boolean
}) {
  const patch = <K extends keyof SocialAdCopy>(key: K, value: SocialAdCopy[K]) => {
    onChange({ ...copy, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="mockup-brand">Page / brand name</Label>
        <Input
          id="mockup-brand"
          value={copy.brandName}
          onChange={(event) => patch("brandName", event.target.value)}
          placeholder="Brand"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mockup-primary">Primary text / caption</Label>
        <Textarea
          id="mockup-primary"
          value={copy.primaryText}
          onChange={(event) => patch("primaryText", event.target.value)}
          placeholder="Write primary text…"
          rows={4}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mockup-headline">Headline</Label>
        <Input
          id="mockup-headline"
          value={copy.headline}
          onChange={(event) => patch("headline", event.target.value)}
          placeholder="Headline"
        />
      </div>

      {showDescription ? (
        <div className="space-y-1.5">
          <Label htmlFor="mockup-description">Description</Label>
          <Input
            id="mockup-description"
            value={copy.description}
            onChange={(event) => patch("description", event.target.value)}
            placeholder="Link description"
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="mockup-display-link">Display link</Label>
        <Input
          id="mockup-display-link"
          value={copy.displayLink}
          onChange={(event) => patch("displayLink", event.target.value)}
          placeholder="assembledmedia.com.au"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mockup-destination">Destination URL</Label>
        <Input
          id="mockup-destination"
          value={copy.destinationUrl}
          onChange={(event) => patch("destinationUrl", event.target.value)}
          placeholder="https://…"
        />
        <p className="text-xs text-muted-foreground">Shown in tooltips only — mockups never navigate.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mockup-cta">CTA label</Label>
        <Select
          value={copy.ctaLabel}
          onValueChange={(value) => patch("ctaLabel", value as SocialCtaLabel)}
        >
          <SelectTrigger id="mockup-cta">
            <SelectValue placeholder="CTA" />
          </SelectTrigger>
          <SelectContent>
            {SOCIAL_CTA_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function MockupDialog({
  asset,
  open,
  onOpenChange,
  defaultBrandName,
}: MockupDialogProps) {
  const [templateId, setTemplateId] = useState<MockTemplateId>("facebook-feed")
  const [adCopy, setAdCopy] = useState<SocialAdCopy>(() =>
    createDefaultSocialAdCopy(defaultBrandName),
  )

  const template = getMockTemplate(templateId)
  const isSocial = template.kind === "social"

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
                ? `Preview “${asset.asset_name}” in social and webpage frames.`
                : "Preview creative in social and webpage frames."}
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

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {isSocial ? (
            <aside className="shrink-0 overflow-y-auto border-b border-border bg-surface-panel px-4 py-4 lg:w-[320px] lg:border-b-0 lg:border-r">
              <SocialAdForm
                copy={adCopy}
                onChange={setAdCopy}
                showDescription={templateId === "facebook-feed"}
              />
            </aside>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto bg-background px-4 py-6 sm:px-8">
            {asset ? (
              isSocial ? (
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
                />
              ) : (
                <WebPageMockTemplates
                  templateId={templateId as "news-article" | "homepage"}
                  asset={asset}
                />
              )
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
