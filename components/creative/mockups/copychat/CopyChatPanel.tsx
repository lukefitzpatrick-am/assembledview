"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { FileSpreadsheet, Loader2, Send, Sparkles } from "lucide-react"
import { saveAs } from "file-saver"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { MiOpenQuestionsForm } from "@/components/specs/MiOpenQuestionsForm"
import type { LineItemOption } from "@/lib/creative/lineItemOptions"
import type { CreativeAsset } from "@/lib/creative/types"
import type { MiClientPrefill } from "@/lib/specs/applyClientPrefill"
import {
  buildMockupMiAutoAnswers,
  mergeMiAnswers,
} from "@/lib/specs/miAutoAnswers"
import type { MiAnswer, MiOpenQuestion } from "@/lib/specs/resolve"
import { cn } from "@/lib/utils"
import { captureVideoFrameDataUrl } from "../scenes/useVideoFrames"
import {
  SOCIAL_CTA_OPTIONS,
  type SocialAdCopy,
  type SocialCtaLabel,
} from "../social/types"
import { isHtml5Zip, isVideo } from "../social/shared"

export type AdCopyPlatform =
  | "facebook-feed"
  | "instagram-feed"
  | "instagram-story"
  | "tiktok"

export type AdCopyVariant = {
  angle: string
  primaryText: string
  headline: string
  description: string
  cta: SocialCtaLabel
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  options?: AdCopyVariant[]
  /** Distinct from AVA copy — muted/critical failure bubble. */
  tone?: "error"
}

type CopyChatPanelProps = {
  asset: CreativeAsset
  platform: AdCopyPlatform
  copy: SocialAdCopy
  onChange: (next: SocialAdCopy) => void
  showDescription: boolean
  clientName?: string
  campaignName?: string
  mbaNumber?: string
  socialLineItems: LineItemOption[]
  /** When true, Ad details are rendered beside this panel — skip the accordion. */
  hideDetailsAccordion?: boolean
  className?: string
}

const SUGGESTIONS = [
  "Write 12 options from the creative",
  "Tighten to a retail offer",
  "More curiosity hooks",
] as const

const NO_BRIEF_LABEL = "No brief — research & write"

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function SocialAdDetailsForm({
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
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="copychat-brand">Page / brand name</Label>
        <Input
          id="copychat-brand"
          value={copy.brandName}
          onChange={(event) => patch("brandName", event.target.value)}
          placeholder="Brand"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="copychat-primary">Primary text / caption</Label>
        <Textarea
          id="copychat-primary"
          value={copy.primaryText}
          onChange={(event) => patch("primaryText", event.target.value)}
          placeholder="Write primary text…"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="copychat-headline">Headline</Label>
        <Input
          id="copychat-headline"
          value={copy.headline}
          onChange={(event) => patch("headline", event.target.value)}
          placeholder="Headline"
        />
      </div>

      {showDescription ? (
        <div className="space-y-1.5">
          <Label htmlFor="copychat-description">Description</Label>
          <Input
            id="copychat-description"
            value={copy.description}
            onChange={(event) => patch("description", event.target.value)}
            placeholder="Link description"
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="copychat-display-link">Display link</Label>
        <Input
          id="copychat-display-link"
          value={copy.displayLink}
          onChange={(event) => patch("displayLink", event.target.value)}
          placeholder="assembledmedia.com.au"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="copychat-destination">Destination URL</Label>
        <Input
          id="copychat-destination"
          value={copy.destinationUrl}
          onChange={(event) => patch("destinationUrl", event.target.value)}
          placeholder="https://…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="copychat-cta">CTA label</Label>
        <Select
          value={copy.ctaLabel}
          onValueChange={(value) => patch("ctaLabel", value as SocialCtaLabel)}
        >
          <SelectTrigger id="copychat-cta">
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

export function CopyChatPanel({
  asset,
  platform,
  copy,
  onChange,
  showDescription,
  clientName,
  campaignName,
  mbaNumber,
  socialLineItems,
  hideDetailsAccordion = false,
  className,
}: CopyChatPanelProps) {
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [options, setOptions] = useState<AdCopyVariant[]>([])
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [buildingMi, setBuildingMi] = useState(false)
  const [lineItemId, setLineItemId] = useState("")
  const [miPrefill, setMiPrefill] = useState<MiClientPrefill[] | null>(null)
  const [miAnswers, setMiAnswers] = useState<MiAnswer[]>([])
  const [miOpenQuestions, setMiOpenQuestions] = useState<MiOpenQuestion[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const hasCopy =
    Boolean(copy.primaryText.trim()) ||
    Boolean(copy.headline.trim()) ||
    Boolean(copy.description.trim())

  const defaultLineItemId = useMemo(() => {
    const linked = asset.line_item_id?.trim()
    if (linked && socialLineItems.some((item) => item.line_item_id === linked)) {
      return linked
    }
    return socialLineItems[0]?.line_item_id ?? ""
  }, [asset.line_item_id, socialLineItems])

  useEffect(() => {
    setLineItemId(defaultLineItemId)
  }, [defaultLineItemId, asset.id])

  useEffect(() => {
    setMessages([])
    setOptions([])
    setSelected(new Set())
    setPreviewIndex(null)
    setDraft("")
  }, [asset.id, platform])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, options, sending])

  function applyPreview(variant: AdCopyVariant, index: number) {
    setPreviewIndex(index)
    onChange({
      ...copy,
      primaryText: variant.primaryText,
      headline: variant.headline,
      description: variant.description,
      ctaLabel: variant.cta,
    })
  }

  function toggleSelected(index: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function sendMessage(text: string, opts?: { noBrief?: boolean }) {
    const trimmed = text.trim()
    const isFirstTurn = messages.length === 0
    const noBrief = Boolean(opts?.noBrief) || (isFirstTurn && !trimmed)
    if (sending) return
    if (!noBrief && !trimmed) return

    if (isHtml5Zip(asset.mime_type)) {
      toast({
        title: "Not supported",
        description: "HTML5 zip creatives can't use AVA copy generation.",
        variant: "destructive",
      })
      return
    }

    const displayText = noBrief ? NO_BRIEF_LABEL : trimmed
    const userMessage: ChatMessage = { id: newId(), role: "user", text: displayText }
    const nextThread = [...messages, userMessage]
    setMessages(nextThread)
    setDraft("")
    setSending(true)

    try {
      let videoFrameDataUrl: string | undefined
      if (isVideo(asset.mime_type)) {
        try {
          videoFrameDataUrl = await captureVideoFrameDataUrl(asset)
        } catch (frameError) {
          console.error("[CopyChatPanel] frame capture failed", frameError)
          setMessages((prev) => [
            ...prev,
            {
              id: newId(),
              role: "assistant",
              tone: "error",
              text: "Couldn't read the creative — media downloads are failing (see console)",
            },
          ])
          return
        }
      }

      const response = await fetch("/api/creative-assets/ad-copy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: asset.id,
          platform,
          brandName: copy.brandName,
          clientName,
          campaignName,
          destinationUrl: copy.destinationUrl || undefined,
          videoFrameDataUrl,
          optionCount: 12,
          mode: noBrief ? "no_brief" : undefined,
          messages: nextThread.map((msg) => ({ role: msg.role, text: msg.text })),
        }),
      })

      const data = (await response.json()) as {
        reply?: string
        options?: AdCopyVariant[]
        error?: string
        message?: string
      }

      if (!response.ok) {
        console.error("[CopyChatPanel] ad-copy POST failed", response.status, data)
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            tone: "error",
            text: "Couldn't read the creative — media downloads are failing (see console)",
          },
        ])
        return
      }

      const reply = data.reply?.trim() || "Here are some options."
      const nextOptions = data.options ?? []
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: reply,
          options: nextOptions.length > 0 ? nextOptions : undefined,
        },
      ])
      if (nextOptions.length > 0) {
        setOptions(nextOptions)
        setSelected(new Set())
        setPreviewIndex(null)
      }
    } catch (error) {
      console.error("[CopyChatPanel] ad-copy request failed", error)
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          tone: "error",
          text: "Couldn't read the creative — media downloads are failing (see console)",
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function miExportUrl() {
    return `/api/mediaplans/mba/${encodeURIComponent(mbaNumber!.trim())}/material-instructions`
  }

  async function dryRunMi(answers: MiAnswer[]) {
    const response = await fetch(miExportUrl(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: true, answers }),
    })
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(data?.error ?? "Couldn't resolve MI questions.")
    }
    return (await response.json()) as {
      open_questions: MiOpenQuestion[]
      summary: { resolved: number; open: number }
    }
  }

  async function downloadMiWorkbook(
    answers: MiAnswer[],
    client_prefill: MiClientPrefill[],
  ) {
    const response = await fetch(miExportUrl(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, client_prefill }),
    })
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(data?.error ?? "Couldn't build the workbook.")
    }
    const blob = await response.blob()
    const disposition = response.headers.get("Content-Disposition") ?? ""
    const match = disposition.match(/filename="([^"]+)"/)
    saveAs(blob, match?.[1] ?? "material-instructions.xlsx")
    const gapCount = Number(response.headers.get("X-Mi-Gap-Count") ?? "0")
    toast({
      title: "MI downloaded",
      description:
        gapCount > 0
          ? `Downloaded with ${gapCount} spec gap(s) remaining.`
          : `Social tab pre-filled for ${client_prefill.length} line item row(s).`,
    })
  }

  /** Iteratively dry-run + auto-answer creative_type / format from mockup context. */
  async function collectMockupAutoAnswers(lineId: string): Promise<{
    answers: MiAnswer[]
    openQuestions: MiOpenQuestion[]
  }> {
    let answers: MiAnswer[] = []
    let openQuestions: MiOpenQuestion[] = []
    for (let step = 0; step < 4; step += 1) {
      const result = await dryRunMi(answers)
      openQuestions = result.open_questions ?? []
      const auto = buildMockupMiAutoAnswers({
        lineItemId: lineId,
        mimeTypes: [asset.mime_type],
        platform,
        openQuestions,
      })
      const merged = mergeMiAnswers(answers, auto)
      const before = new Set(answers.map((item) => `${item.questionId}=${item.answer}`))
      const added = merged.some((item) => !before.has(`${item.questionId}=${item.answer}`))
      answers = merged
      if (!added) break
    }
    const final = await dryRunMi(answers)
    return { answers, openQuestions: final.open_questions ?? [] }
  }

  async function buildMi() {
    if (!mbaNumber?.trim()) {
      toast({
        title: "No campaign linked",
        description: "Open creatives from a media plan to download a filled MI.",
        variant: "destructive",
      })
      return
    }
    if (!lineItemId) {
      toast({
        title: "Pick a line item",
        description: "Select a social line item for the MI rows.",
        variant: "destructive",
      })
      return
    }
    const indices = [...selected].sort((a, b) => a - b)
    if (indices.length === 0) return

    setBuildingMi(true)
    try {
      const client_prefill: MiClientPrefill[] = indices.map((index, order) => {
        const option = options[index]
        return {
          line_item_id: lineItemId,
          variant: String.fromCharCode(65 + order),
          fields: {
            "Image/Video File Name": asset.original_filename || asset.asset_name,
            "Primary Text": option.primaryText,
            Headline: option.headline,
            Description: option.description,
            "Call To Action": option.cta,
            "Landing Page URL": copy.destinationUrl,
          },
        }
      })

      const { answers, openQuestions } = await collectMockupAutoAnswers(lineItemId)
      if (openQuestions.length > 0) {
        setMiPrefill(client_prefill)
        setMiAnswers(answers)
        setMiOpenQuestions(openQuestions)
        return
      }

      await downloadMiWorkbook(answers, client_prefill)
    } catch (error) {
      toast({
        title: "MI download failed",
        description:
          error instanceof Error ? error.message : "Something went wrong building the workbook.",
        variant: "destructive",
      })
    } finally {
      setBuildingMi(false)
    }
  }

  async function confirmMiQuestions(mergedAnswers: MiAnswer[]) {
    if (!miPrefill) return
    setBuildingMi(true)
    try {
      await downloadMiWorkbook(mergedAnswers, miPrefill)
      setMiOpenQuestions(null)
      setMiPrefill(null)
      setMiAnswers([])
    } catch (error) {
      toast({
        title: "MI download failed",
        description:
          error instanceof Error ? error.message : "Something went wrong building the workbook.",
        variant: "destructive",
      })
    } finally {
      setBuildingMi(false)
    }
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {!hideDetailsAccordion ? (
        <Accordion
          type="single"
          collapsible
          defaultValue={hasCopy ? undefined : "details"}
          className="shrink-0 border-b border-border px-1 xl:hidden"
        >
          <AccordionItem value="details" className="border-b-0">
            <AccordionTrigger className="py-3 text-sm">Ad details</AccordionTrigger>
            <AccordionContent>
              <SocialAdDetailsForm
                copy={copy}
                onChange={onChange}
                showDescription={showDescription}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3">
        {messages.length === 0 ? (
          <div className="space-y-3 rounded-card border border-border bg-card p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-primary" aria-hidden />
              AVA copy workshop
            </p>
            <p className="text-xs text-muted-foreground">
              Brief AVA on the angle you want. It returns 12 options you can preview in the
              mockup and select for a filled MI.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="interactive-tint rounded-pill border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
                disabled={sending}
                onClick={() => void sendMessage("", { noBrief: true })}
              >
                {NO_BRIEF_LABEL}
              </button>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="interactive-tint rounded-pill border border-border bg-background px-3 py-1 text-xs"
                  disabled={sending}
                  onClick={() => void sendMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "rounded-card px-3 py-2 text-sm",
              message.role === "user"
                ? "ml-6 bg-primary text-primary-foreground"
                : message.tone === "error"
                  ? "mr-4 border border-destructive/40 bg-pacing-critical-bg text-status-critical-fg"
                  : "mr-4 border border-border bg-card text-foreground",
            )}
            role={message.tone === "error" ? "alert" : undefined}
          >
            <p className="whitespace-pre-wrap">{message.text}</p>
          </div>
        ))}

        {sending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {messages.some((m) => m.text === NO_BRIEF_LABEL)
              ? "AVA is researching & writing…"
              : "AVA is writing…"}
          </p>
        ) : null}

        {options.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Options · Preview updates the mock · checkbox selects for MI
            </p>
            {options.map((option, index) => {
              const isSelected = selected.has(index)
              const isPreview = previewIndex === index
              return (
                <div
                  key={`${option.angle}-${index}`}
                  className={cn(
                    "rounded-card border border-border bg-card p-3",
                    isPreview && "ring-2 ring-ring",
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {index + 1}. {option.angle}
                      </p>
                      <p className="mt-1 text-sm text-foreground">{option.primaryText}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {option.headline}
                        {option.description ? ` · ${option.description}` : ""}
                        {` · ${option.cta}`}
                      </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(index)}
                        aria-label={`Select option ${index + 1} for MI`}
                      />
                      MI
                    </label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isPreview ? "default" : "secondary"}
                    onClick={() => applyPreview(option, index)}
                  >
                    Preview
                  </Button>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-surface-panel p-3">
        {miOpenQuestions && miOpenQuestions.length > 0 ? (
          <div className="rounded-card border border-border bg-card p-3">
            <MiOpenQuestionsForm
              key={miOpenQuestions.map((question) => question.id).join("|")}
              openQuestions={miOpenQuestions}
              initialAnswers={miAnswers}
              busy={buildingMi}
              confirmLabel={buildingMi ? "Building MI…" : "Download MI"}
              onCancel={() => {
                setMiOpenQuestions(null)
                setMiPrefill(null)
                setMiAnswers([])
              }}
              onConfirm={(answers) => void confirmMiQuestions(answers)}
            />
          </div>
        ) : selected.size > 0 ? (
          <div className="space-y-2 rounded-input border border-border bg-card p-2">
            {socialLineItems.length > 1 || !asset.line_item_id ? (
              <div className="space-y-1">
                <Label className="text-xs">MI line item</Label>
                <Select value={lineItemId || undefined} onValueChange={setLineItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select social line item" />
                  </SelectTrigger>
                  <SelectContent>
                    {socialLineItems.map((item) => (
                      <SelectItem key={item.line_item_id} value={item.line_item_id}>
                        {item.line_item_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={buildingMi || !lineItemId || !mbaNumber}
              onClick={() => void buildMi()}
            >
              {buildingMi ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Building MI…
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 size-4" aria-hidden />
                  Build MI from selected ({selected.size})
                </>
              )}
            </Button>
          </div>
        ) : null}

        {miOpenQuestions && miOpenQuestions.length > 0 ? null : (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void sendMessage(draft)
          }}
        >
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              messages.length === 0
                ? "Brief AVA… or send empty to research & write"
                : "Brief AVA…"
            }
            rows={2}
            className="min-h-[64px] flex-1 resize-none"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void sendMessage(draft)
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || (messages.length > 0 && !draft.trim())}
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
        </form>
        )}
      </div>
    </div>
  )
}
