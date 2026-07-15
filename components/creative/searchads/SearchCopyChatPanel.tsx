"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { FileSpreadsheet, Loader2, Send, Sparkles } from "lucide-react"
import { saveAs } from "file-saver"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import type {
  SearchAdCopy,
  SearchAdFormat,
  SearchAsset,
  SearchAssetPin,
  SearchLimits,
} from "@/components/creative/searchads/types"
import type { LineItemOption } from "@/lib/creative/lineItemOptions"
import type { MiClientPrefill, MiClientPrefillField } from "@/lib/specs/applyClientPrefill"
import { mergeMiAnswers } from "@/lib/specs/miAutoAnswers"
import { buildSearchMiAutoAnswers } from "@/lib/specs/searchMiAutoAnswers"
import type { MiAnswer, MiOpenQuestion } from "@/lib/specs/resolve"
import { cn } from "@/lib/utils"

/** Prompt 0 #2: workbook writes fields_client as a raw string; newline-join multi-value cells. */
const MI_CELL_DELIMITER = "\n"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  tone?: "error"
}

type SearchCopyChatPanelProps = {
  mbaNumber: string
  format: SearchAdFormat
  copy: SearchAdCopy
  onChange: (next: SearchAdCopy) => void
  limits: SearchLimits
  clientName?: string
  campaignName?: string
  brandName: string
  adGroup?: string
  keywords?: string
  complianceCategory?: "none" | "financial" | "alcohol" | "health"
  searchLineItems: LineItemOption[]
  className?: string
}

const NO_BRIEF_LABEL = "No brief — research & write"

const SUGGESTIONS = [
  "Write a full RSA set",
  "More proof/offer angles",
  "Tighten headlines under 20 chars",
] as const

const HEADLINE_PINS: Array<Exclude<SearchAssetPin, null>> = ["H1", "H2", "H3"]
const DESCRIPTION_PINS: Array<Exclude<SearchAssetPin, null>> = ["D1", "D2"]

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function CharCounter({ length, limit }: { length: number; limit: number }) {
  const over = length > limit
  return (
    <span
      className={cn(
        "num shrink-0 text-[11px] tabular-nums",
        over ? "text-status-critical-fg" : "text-muted-foreground",
      )}
    >
      {length}/{limit}
    </span>
  )
}

function AssetRow({
  asset,
  charLimit,
  pinOptions,
  onPatch,
}: {
  asset: SearchAsset
  charLimit: number
  pinOptions: Array<Exclude<SearchAssetPin, null>>
  onPatch: (next: SearchAsset) => void
}) {
  const pinValue = asset.pinned ?? "none"
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-input border border-border bg-card p-2">
      <Input
        value={asset.text}
        onChange={(event) => onPatch({ ...asset, text: event.target.value })}
        className="min-w-[12rem] flex-1"
        placeholder="Asset text…"
      />
      <CharCounter length={asset.text.length} limit={charLimit} />
      <Badge variant="outline" size="sm" className="capitalize">
        {asset.angle}
      </Badge>
      <Select
        value={pinValue}
        onValueChange={(value) =>
          onPatch({
            ...asset,
            pinned: value === "none" ? null : (value as SearchAssetPin),
          })
        }
      >
        <SelectTrigger className="h-8 w-[5.5rem]" aria-label="Pin">
          <SelectValue placeholder="Pin" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">none</SelectItem>
          {pinOptions.map((pin) => (
            <SelectItem key={pin} value={pin}>
              {pin}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function joinAssetTexts(assets: SearchAsset[] | undefined): string {
  return (assets ?? [])
    .map((asset) => asset.text.trim())
    .filter(Boolean)
    .join(MI_CELL_DELIMITER)
}

function buildSearchClientPrefill(
  lineItemId: string,
  copy: SearchAdCopy,
): MiClientPrefill {
  // v1: PMax long headlines / businessName are omitted — not Search-tab CLIENT columns
  // (businessName) and long headlines would need a free-text convention; keep the workbook
  // valid with standard Headlines + Descriptions only.
  const fields: Partial<Record<MiClientPrefillField, string>> = {
    "Final URL": copy.finalUrl,
    "Display Path 1": copy.path1,
    "Display Path 2": copy.path2,
    "Headlines (1-15)": joinAssetTexts(copy.headlines),
    "Descriptions (1-4)": joinAssetTexts(copy.descriptions),
  }

  const sitelinks = (copy.sitelinks ?? [])
    .map((link) => link.text.trim())
    .filter(Boolean)
    .join(MI_CELL_DELIMITER)
  if (sitelinks) fields.Sitelinks = sitelinks

  const callouts = (copy.callouts ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .join(MI_CELL_DELIMITER)
  if (callouts) fields.Callouts = callouts

  return { line_item_id: lineItemId, fields }
}

export function SearchCopyChatPanel({
  mbaNumber,
  format,
  copy,
  onChange,
  limits,
  clientName,
  campaignName,
  brandName,
  adGroup,
  keywords,
  complianceCategory,
  searchLineItems,
  className,
}: SearchCopyChatPanelProps) {
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [buildingMi, setBuildingMi] = useState(false)
  const [lineItemId, setLineItemId] = useState("")
  const [miPrefill, setMiPrefill] = useState<MiClientPrefill[] | null>(null)
  const [miAnswers, setMiAnswers] = useState<MiAnswer[]>([])
  const [miOpenQuestions, setMiOpenQuestions] = useState<MiOpenQuestion[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const hasHeadline = copy.headlines.some((asset) => asset.text.trim())
  const canBuildMi =
    hasHeadline && Boolean(mbaNumber.trim()) && Boolean(lineItemId) && searchLineItems.length > 0

  const defaultLineItemId = useMemo(
    () => searchLineItems[0]?.line_item_id ?? "",
    [searchLineItems],
  )

  useEffect(() => {
    setLineItemId(defaultLineItemId)
  }, [defaultLineItemId])

  useEffect(() => {
    setMessages([])
    setDraft("")
    setMiOpenQuestions(null)
    setMiPrefill(null)
    setMiAnswers([])
  }, [format, mbaNumber])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, sending, copy.headlines.length, copy.descriptions.length])

  function patchCopy(partial: Partial<SearchAdCopy>) {
    onChange({ ...copy, ...partial })
  }

  function patchHeadline(index: number, next: SearchAsset) {
    const headlines = copy.headlines.map((asset, i) => (i === index ? next : asset))
    patchCopy({ headlines })
  }

  function patchDescription(index: number, next: SearchAsset) {
    const descriptions = copy.descriptions.map((asset, i) => (i === index ? next : asset))
    patchCopy({ descriptions })
  }

  function patchLongHeadline(index: number, next: SearchAsset) {
    const longHeadlines = (copy.longHeadlines ?? []).map((asset, i) =>
      i === index ? next : asset,
    )
    patchCopy({ longHeadlines })
  }

  async function sendMessage(text: string, opts?: { noBrief?: boolean }) {
    const trimmed = text.trim()
    const isFirstTurn = messages.length === 0
    const noBrief = Boolean(opts?.noBrief) || (isFirstTurn && !trimmed)
    if (sending) return
    if (!noBrief && !trimmed) return

    const displayText = noBrief ? NO_BRIEF_LABEL : trimmed
    const userMessage: ChatMessage = { id: newId(), role: "user", text: displayText }
    const nextThread = [...messages, userMessage]
    setMessages(nextThread)
    setDraft("")
    setSending(true)

    try {
      const response = await fetch("/api/creative-assets/search-copy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mbaNumber,
          format,
          brandName,
          clientName,
          campaignName,
          adGroup,
          keywords,
          finalUrl: copy.finalUrl || undefined,
          complianceCategory,
          mode: noBrief ? "no_brief" : undefined,
          messages: nextThread.map((msg) => ({ role: msg.role, text: msg.text })),
        }),
      })

      const data = (await response.json()) as {
        reply?: string
        copy?: SearchAdCopy
        error?: string
        message?: string
      }

      if (!response.ok) {
        console.error("[SearchCopyChatPanel] search-copy POST failed", response.status, data)
        if (data.error === "rate_limited") {
          toast({
            title: "Rate limited",
            description:
              data.message ?? "Too many AVA copy requests. Try again in a minute.",
            variant: "destructive",
          })
        }
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            tone: "error",
            text:
              data.message
              ?? (data.error === "rate_limited"
                ? "Too many AVA copy requests. Try again in a minute."
                : "Couldn't generate search copy — see console"),
          },
        ])
        return
      }

      const reply = data.reply?.trim() || "Here's a search asset set."
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", text: reply },
      ])
      if (data.copy) {
        onChange({
          ...data.copy,
          format: data.copy.format || format,
          finalUrl: data.copy.finalUrl || copy.finalUrl,
        })
      }
    } catch (error) {
      console.error("[SearchCopyChatPanel] search-copy request failed", error)
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          tone: "error",
          text: "Couldn't generate search copy — see console",
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function miExportUrl() {
    return `/api/mediaplans/mba/${encodeURIComponent(mbaNumber.trim())}/material-instructions`
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
      title: "MI downloaded — Search tab pre-filled.",
      description:
        gapCount > 0
          ? `Downloaded with ${gapCount} spec gap(s) remaining.`
          : undefined,
    })
  }

  async function collectSearchAutoAnswers(lineId: string): Promise<{
    answers: MiAnswer[]
    openQuestions: MiOpenQuestion[]
  }> {
    let answers: MiAnswer[] = []
    let openQuestions: MiOpenQuestion[] = []
    for (let step = 0; step < 4; step += 1) {
      const result = await dryRunMi(answers)
      openQuestions = result.open_questions ?? []
      const auto = buildSearchMiAutoAnswers({
        lineItemId: lineId,
        format: copy.format,
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
    if (!mbaNumber.trim()) {
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
        description: "Select a search line item for the MI rows.",
        variant: "destructive",
      })
      return
    }
    if (!hasHeadline) return

    setBuildingMi(true)
    try {
      const client_prefill = [buildSearchClientPrefill(lineItemId, copy)]
      const { answers, openQuestions } = await collectSearchAutoAnswers(lineItemId)
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
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3">
        {messages.length === 0 ? (
          <div className="space-y-3 rounded-card border border-border bg-card p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-primary" aria-hidden />
              AVA search copy workshop
            </p>
            <p className="text-xs text-muted-foreground">
              Brief AVA for Google {format === "rsa" ? "RSA" : "Performance Max"} assets. The
              working set updates the SERP preview and editable list below.
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

        <div className="space-y-3 rounded-card border border-border bg-card p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Working set · edits update the SERP live
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor="search-final-url">Final URL</Label>
              <Input
                id="search-final-url"
                value={copy.finalUrl}
                onChange={(event) => patchCopy({ finalUrl: event.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="search-path1">Path 1</Label>
                <CharCounter length={copy.path1.length} limit={limits.path} />
              </div>
              <Input
                id="search-path1"
                value={copy.path1}
                onChange={(event) => patchCopy({ path1: event.target.value })}
                placeholder="path"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="search-path2">Path 2</Label>
                <CharCounter length={copy.path2.length} limit={limits.path} />
              </div>
              <Input
                id="search-path2"
                value={copy.path2}
                onChange={(event) => patchCopy({ path2: event.target.value })}
                placeholder="path"
              />
            </div>
          </div>

          {format === "pmax" ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="search-business-name">Business name</Label>
                <CharCounter
                  length={(copy.businessName ?? "").length}
                  limit={limits.businessName}
                />
              </div>
              <Input
                id="search-business-name"
                value={copy.businessName ?? ""}
                onChange={(event) => patchCopy({ businessName: event.target.value })}
                placeholder="Business name"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              Headlines
              <span className="ml-1 text-muted-foreground">
                ({copy.headlines.length}/{limits.maxHeadlines})
              </span>
            </p>
            {copy.headlines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No headlines yet — ask AVA to write.</p>
            ) : (
              copy.headlines.map((asset, index) => (
                <AssetRow
                  key={`h-${index}`}
                  asset={asset}
                  charLimit={limits.headline}
                  pinOptions={HEADLINE_PINS}
                  onPatch={(next) => patchHeadline(index, next)}
                />
              ))
            )}
          </div>

          {format === "pmax" ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                Long headlines
                <span className="ml-1 text-muted-foreground">
                  ({(copy.longHeadlines ?? []).length}/{limits.maxLongHeadlines})
                </span>
              </p>
              {(copy.longHeadlines ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No long headlines yet.</p>
              ) : (
                (copy.longHeadlines ?? []).map((asset, index) => (
                  <AssetRow
                    key={`lh-${index}`}
                    asset={asset}
                    charLimit={limits.longHeadline}
                    pinOptions={HEADLINE_PINS}
                    onPatch={(next) => patchLongHeadline(index, next)}
                  />
                ))
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              Descriptions
              <span className="ml-1 text-muted-foreground">
                ({copy.descriptions.length}/{limits.maxDescriptions})
              </span>
            </p>
            {copy.descriptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No descriptions yet.</p>
            ) : (
              copy.descriptions.map((asset, index) => (
                <AssetRow
                  key={`d-${index}`}
                  asset={asset}
                  charLimit={limits.description}
                  pinOptions={DESCRIPTION_PINS}
                  onPatch={(next) => patchDescription(index, next)}
                />
              ))
            )}
          </div>
        </div>
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
        ) : (
          <>
            <div className="space-y-2 rounded-input border border-border bg-card p-2">
              {searchLineItems.length > 0 ? (
                <div className="space-y-1">
                  <Label className="text-xs">MI line item</Label>
                  <Select value={lineItemId || undefined} onValueChange={setLineItemId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select search line item" />
                    </SelectTrigger>
                    <SelectContent>
                      {searchLineItems.map((item) => (
                        <SelectItem key={item.line_item_id} value={item.line_item_id}>
                          {item.line_item_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No search line items on this plan — MI export needs one.
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={buildingMi || !canBuildMi}
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
                    Build MI from this set
                  </>
                )}
              </Button>
            </div>

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
          </>
        )}
      </div>
    </div>
  )
}
