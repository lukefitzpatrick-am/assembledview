"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { getAssistantContext, subscribeAvaChatOpen } from "@/lib/assistantBridge"
import { coerceChatFileAttachments } from "@/lib/ava/chatFileAttachment"
import {
  coerceChatInterviewQuestions,
  displayMiAnswerText,
  lockChatQuestionAnswer,
} from "@/lib/ava/chatInterviewQuestion"
import type { ChatFileAttachment, FormPatch, ModelChatReply, PageContext } from "@/lib/ava/types"
import type { CapturedLineItemsLoad } from "@/lib/ava/autopopulate/types"
import type { PendingParsedPlan } from "@/lib/ava/tools/types"
import { writeIngestStageToSession } from "@/lib/mediaplans/ingest/ingestStageClient"
import {
  applyIngestStageMissingMeta,
  buildIngestUploadUserMessage,
  buildPendingIngestPayload,
  pendingIngestChipCopy,
  type PendingIngestPayload,
} from "@/lib/ava/ingestUploadTurn"
import type { ChatMode } from "@/src/ava/modes"
import { ChatAssistantTurn } from "@/components/ava/ChatAssistantTurn"
import { ChatThinkingIndicator } from "@/components/ava/ChatThinkingIndicator"
import { ChatUserMessage } from "@/components/ava/ChatUserMessage"
import { ChatQuestionCard, type ChatQuestionCardState } from "@/components/ChatQuestionCard"
import {
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Maximize2,
  PanelBottom,
  PanelBottomClose,
  Paperclip,
  X,
} from "lucide-react"

type PendingIngestClient = PendingIngestPayload

const SIZE_PRESETS = {
  compact: { w: 384, h: 480 },
  large: { w: 560, h: 640 },
  max: { w: 0, h: 0 }, // resolved at apply time
} as const

type PanelSize = { w: number; h: number }
type SizePresetKey = keyof typeof SIZE_PRESETS

const MIN_W = 320
const MIN_H = 380
const PANEL_SIZE_KEY = "ava:panel-size"

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function resolveMaxPreset(): PanelSize {
  if (typeof window === "undefined") return { w: 1100, h: 900 }
  return {
    w: Math.min(Math.floor(window.innerWidth * 0.9), 1100),
    h: Math.min(Math.floor(window.innerHeight * 0.85), 900),
  }
}

function clampPanelSize(size: PanelSize): PanelSize {
  if (typeof window === "undefined") {
    return {
      w: clamp(size.w, MIN_W, 1100),
      h: clamp(size.h, MIN_H, 900),
    }
  }
  return {
    w: clamp(size.w, MIN_W, window.innerWidth - 48),
    h: clamp(size.h, MIN_H, window.innerHeight - 48),
  }
}

function readStoredPanelSize(): PanelSize {
  if (typeof window === "undefined") return SIZE_PRESETS.compact
  try {
    const raw = localStorage.getItem(PANEL_SIZE_KEY)
    if (!raw) return SIZE_PRESETS.compact
    const parsed = JSON.parse(raw) as Partial<PanelSize>
    if (typeof parsed?.w !== "number" || typeof parsed?.h !== "number") {
      return SIZE_PRESETS.compact
    }
    return clampPanelSize({ w: parsed.w, h: parsed.h })
  } catch {
    return SIZE_PRESETS.compact
  }
}

function persistPanelSize(size: PanelSize) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(size))
  } catch {
    // ignore quota / private mode
  }
}

type ChatUiMessage = {
  role: "user" | "assistant"
  content: string
  createdAt?: number
  /** Display-only; never sent back to /api/chat-v2. */
  attachments?: ChatFileAttachment[]
  /** Display-only interview cards; never sent back to /api/chat-v2. */
  questions?: ChatQuestionCardState[]
}

const TURN_SEPARATOR_GAP_MS = 10 * 60 * 1000

function formatTurnStamp(ts: number): string {
  return new Date(ts).toLocaleString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  })
}

function shouldShowTurnSeparator(messages: ChatUiMessage[], idx: number): boolean {
  if (messages.length < 4) return false
  const current = messages[idx]?.createdAt
  if (idx === 0) return true
  const prev = messages[idx - 1]?.createdAt
  if (!current || !prev) return false
  return current - prev >= TURN_SEPARATOR_GAP_MS
}

/** Minimal chat message shape previously imported from openai (type-only). */
type ChatApiMessage = {
  role: string
  content?: unknown
}

type ChatWidgetProps = {
  getPageContext?: () => Promise<PageContext | undefined> | PageContext | undefined
  pageContext?: PageContext
  saveSelector?: string
  mode?: ChatMode
  initialMessages?: ChatApiMessage[]
  className?: string
}

const STARTER_CHIPS: Record<ChatMode, string[]> = {
  general: [
    "How is pacing looking for this client?",
    "What fees are set on this client?",
    "What's the affinity methodology?",
  ],
  mediaplan_create: [
    "Help me fill the campaign basics",
    "What's a sensible media mix to start?",
    "Set the campaign name from the brief",
  ],
  mediaplan_edit: [
    "Summarise this media plan",
    "Show creative assets for this MBA",
    "Preview naming for the line items",
  ],
}

function toUiMessages(messages: ChatApiMessage[]): ChatUiMessage[] {
  const out: ChatUiMessage[] = []
  for (const msg of messages) {
    if (msg.role !== "user" && msg.role !== "assistant") continue
    const content = typeof msg.content === "string" ? msg.content : ""
    if (!content) continue
    out.push({ role: msg.role, content })
  }
  return out
}

function toApiMessages(messages: ChatUiMessage[]): ChatApiMessage[] {
  return messages.map((msg) => ({ role: msg.role, content: msg.content }))
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ChatFileCard({ attachment }: { attachment: ChatFileAttachment }) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const sizeLabel =
    typeof attachment.sizeBytes === "number" ? formatFileSize(attachment.sizeBytes) : null
  const expiryHint =
    typeof attachment.expiresInMinutes === "number" && attachment.expiresInMinutes > 0
      ? `link expires in ~${Math.round(attachment.expiresInMinutes)} minutes`
      : null

  async function handleDownload() {
    if (isDownloading) return
    setDownloadError(null)
    setIsDownloading(true)
    try {
      // Fetch-to-blob (not <a href>) so the MBA edit unsaved-changes guard
      // never sees a same-origin navigation and the page stays mounted.
      const response = await fetch(attachment.url, { credentials: "include" })
      if (response.status === 401 || response.status === 403) {
        throw new Error("Download expired or not authorised — ask Ava to export again.")
      }
      if (!response.ok) {
        throw new Error("Download failed. Please try again.")
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = attachment.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed")
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="mr-auto flex w-full min-w-0 max-w-full flex-col gap-1">
      <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-e1">
        <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{attachment.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {[sizeLabel, expiryHint].filter(Boolean).join(" · ") || "Download ready"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isDownloading}
          onClick={() => void handleDownload()}
        >
          {isDownloading ? "Downloading…" : "Download"}
        </Button>
      </div>
      {downloadError ? <p className="text-xs text-destructive">{downloadError}</p> : null}
    </div>
  )
}

export function ChatWidget({
  getPageContext,
  pageContext,
  saveSelector,
  mode = "general",
  initialMessages = [],
  className,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatUiMessage[]>(() => toUiMessages(initialMessages))
  const [error, setError] = useState<string | null>(null)
  const [pendingParsedPlan, setPendingParsedPlan] = useState<PendingParsedPlan | null>(null)
  const pendingParsedPlanRef = useRef<PendingParsedPlan | null>(null)
  const [pendingIngest, setPendingIngest] = useState<PendingIngestClient | null>(null)
  const pendingIngestRef = useRef<PendingIngestClient | null>(null)
  const [isParsingPlan, setIsParsingPlan] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragState, setDragState] = useState<{ offsetX: number; offsetY: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragMovedRef = useRef(false)
  const [panelSize, setPanelSize] = useState<PanelSize>(() => readStoredPanelSize())
  const [resizeState, setResizeState] = useState<{
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)

  const appendAssistantNote = useCallback(
    (content: string) =>
      setMessages((prev) => [...prev, { role: "assistant", content, createdAt: Date.now() }]),
    []
  )

  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const sendMessageRef = useRef<(overrideText?: string, baseMessages?: ChatUiMessage[]) => Promise<void>>(
    async () => {},
  )

  useEffect(() => {
    return subscribeAvaChatOpen(({ message }) => {
      setIsOpen(true)
      setIsCollapsed(false)
      setError(null)
      // Defer one tick so open/collapse paint before the send (and so getPageContext
      // sees the current route after rapid navigation).
      queueMicrotask(() => {
        void sendMessageRef.current(message)
      })
    })
  }, [])

  const startDrag = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      dragMovedRef.current = false
      setDragState({ offsetX: event.clientX - position.x, offsetY: event.clientY - position.y })
    },
    [position.x, position.y]
  )

  const handleToggleClick = useCallback(() => {
    if (dragMovedRef.current || isDragging) {
      dragMovedRef.current = false
      return
    }
    toggle()
  }, [isDragging, toggle])

  useEffect(() => {
    if (!dragState) return

    const handleMouseMove = (event: MouseEvent) => {
      dragMovedRef.current = true
      setIsDragging(true)
      setPosition({
        x: event.clientX - dragState.offsetX,
        y: event.clientY - dragState.offsetY,
      })
    }

    const handleMouseUp = () => {
      setDragState(null)
      requestAnimationFrame(() => setIsDragging(false))
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [dragState])

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      setResizeState({
        startX: event.clientX,
        startY: event.clientY,
        startW: panelSize.w,
        startH: panelSize.h,
      })
    },
    [panelSize.h, panelSize.w],
  )

  useEffect(() => {
    if (!resizeState) return

    const handleMouseMove = (event: MouseEvent) => {
      const next = clampPanelSize({
        w: resizeState.startW + (resizeState.startX - event.clientX),
        h: resizeState.startH + (resizeState.startY - event.clientY),
      })
      setPanelSize(next)
    }

    const handleMouseUp = () => {
      setPanelSize((current) => {
        const clamped = clampPanelSize(current)
        persistPanelSize(clamped)
        return clamped
      })
      setResizeState(null)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [resizeState])

  const applySizePreset = useCallback((key: SizePresetKey) => {
    const next =
      key === "max" ? clampPanelSize(resolveMaxPreset()) : clampPanelSize(SIZE_PRESETS[key])
    setPanelSize(next)
    persistPanelSize(next)
  }, [])

  async function sendMessage(overrideText?: string, baseMessages?: ChatUiMessage[]) {
    const text = (overrideText ?? input).trim()
    if (!text) return
    setIsSending(true)
    setError(null)
    const starting = baseMessages ?? messages
    const updatedMessages: ChatUiMessage[] = [
      ...starting,
      { role: "user", content: text, createdAt: Date.now() },
    ]
    setMessages(updatedMessages)
    setInput("")

    try {
      const resolvedPageContext =
        typeof getPageContext === "function" ? await getPageContext() : pageContext

      const currentLineItems = await collectCurrentLineItemsFromBridge()

      const payload = {
        messages: toApiMessages(updatedMessages),
        pageContext: resolvedPageContext,
        mode,
        ...(pendingParsedPlanRef.current
          ? {
              pendingParsedPlan: {
                channel: pendingParsedPlanRef.current.channel,
                mapped: pendingParsedPlanRef.current.mapped,
                fileName: pendingParsedPlanRef.current.fileName,
              },
            }
          : {}),
        ...(pendingIngestRef.current
          ? {
              pendingIngest: buildPendingIngestPayload({
                stageId: pendingIngestRef.current.stageId,
                fileName: pendingIngestRef.current.fileName,
                summary: pendingIngestRef.current.summary,
              }),
            }
          : {}),
        ...(currentLineItems ? { currentLineItems } : {}),
      }

      const response = await fetch("/api/chat-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      let data: any
      try {
        data = await response.json()
      } catch {
        throw new Error("Sorry — I couldn’t understand that response. Please try again.")
      }
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(data?.error || "AVA is available to Admin users only.")
        }
        throw new Error(data?.error || "Chat failed")
      }

      const parsedReply = coerceModelChatReply(data)
      const nextPending = applyIngestStageMissingMeta(
        pendingIngestRef.current,
        data?.meta,
      )
      if (nextPending !== pendingIngestRef.current) {
        pendingIngestRef.current = nextPending
        setPendingIngest(nextPending)
      }
      // Append a new assistant message (never mutate an earlier card in-session).
      const assistantMessage: ChatUiMessage = {
        role: "assistant",
        content: parsedReply.replyText,
        createdAt: Date.now(),
        ...(parsedReply.attachments?.length ? { attachments: parsedReply.attachments } : {}),
        ...(parsedReply.questions?.length ? { questions: parsedReply.questions } : {}),
      }
      setMessages((prev) => [...prev, assistantMessage])

      const didApplyPatch = await maybeApplyPatch({
        patch: parsedReply.patch,
        pageContext: resolvedPageContext,
        saveSelectorProp: saveSelector,
        appendAssistantNote,
      })

      const didApplyLines = await maybeApplyLineItemsLoad({
        load: parsedReply.lineItemsLoad ?? null,
        appendAssistantNote,
      })
      if (didApplyLines) {
        pendingParsedPlanRef.current = null
        setPendingParsedPlan(null)
      }

      // Legacy fallback (secondary): action JSON embedded in replyText, or response includes { action: ... }.
      if (!didApplyPatch && !didApplyLines) {
        await maybeHandleAssistantAction(parsedReply.replyText, appendAssistantNote)
        await maybeHandleAssistantActionObject(data, appendAssistantNote)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message"
      setError(message)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, something went wrong: ${message}`,
          createdAt: Date.now(),
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  function confirmQuestion(messageIdx: number, questionId: string, answerText: string) {
    const trimmed = answerText.trim()
    if (!trimmed || isSending) return
    const lockedMessages = messages.map((msg, idx) => {
      if (idx !== messageIdx || !msg.questions?.length) return msg
      return {
        ...msg,
        questions: lockChatQuestionAnswer(msg.questions, questionId, trimmed),
      }
    })
    setMessages(lockedMessages)
    void sendMessage(trimmed, lockedMessages)
  }

  sendMessageRef.current = sendMessage

  async function handlePlanFileSelected(file: File | null) {
    if (!file || isSending || isParsingPlan) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      setError("Publisher schedule ingest accepts .xlsx / .xls only.")
      return
    }
    setIsParsingPlan(true)
    setError(null)
    setIsOpen(true)
    setIsCollapsed(false)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch("/api/admin/ingest/review", {
        method: "POST",
        body: formData,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Ingest review failed",
        )
      }
      const stageId = typeof data?.stageId === "string" ? data.stageId.trim() : ""
      if (!stageId || !data?.review) {
        throw new Error("Ingest review returned an unexpected payload")
      }
      writeIngestStageToSession(stageId, {
        review: data.review,
        fileName: file.name,
      })
      const pending = buildPendingIngestPayload({
        stageId,
        fileName: file.name,
        summary: data.summary ?? undefined,
      })
      pendingIngestRef.current = pending
      setPendingIngest(pending)
      await sendMessage(buildIngestUploadUserMessage(file.name))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to review schedule"
      setError(message)
      appendAssistantNote(`Schedule ingest failed: ${message}`)
    } finally {
      setIsParsingPlan(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const starterChips = STARTER_CHIPS[mode] ?? STARTER_CHIPS.general

  return (
    <div
      className={cn("fixed bottom-6 right-6 z-assistant", className)}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      {!isOpen && (
        <Button
          onMouseDown={startDrag}
          onClick={handleToggleClick}
          className={cn(
            "rounded-full shadow-lg cursor-grab active:cursor-grabbing",
            isDragging && "cursor-grabbing"
          )}
          size="lg"
          variant="default"
        >
          Ask Ava
        </Button>
      )}

      {isOpen && (
        <div
          className={cn(
            "relative mt-3 flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-2xl",
            isCollapsed ? "w-80" : undefined,
          )}
          style={
            isCollapsed
              ? undefined
              : { width: panelSize.w, height: panelSize.h }
          }
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
          }}
          onDrop={(e) => {
            e.preventDefault()
            const dropped = e.dataTransfer.files?.[0] ?? null
            void handlePlanFileSelected(dropped)
          }}
        >
          {!isCollapsed && (
            <button
              type="button"
              aria-label="Resize Ava chat"
              title="Drag to resize"
              className="absolute left-0 top-0 z-10 flex h-4 w-4 cursor-nwse-resize items-center justify-center rounded-tl-xl text-muted-foreground/50 hover:text-muted-foreground"
              onMouseDown={startResize}
            >
              <span
                className="pointer-events-none block h-2.5 w-2.5 border-l-2 border-t-2 border-current opacity-70"
                aria-hidden
              />
            </button>
          )}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div
              className={cn(
                "cursor-grab select-none",
                isDragging && "cursor-grabbing"
              )}
              onMouseDown={startDrag}
            >
              <p className="text-sm font-semibold text-foreground">Ava</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">Ask about this page, plans, or delivery</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {!isCollapsed && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => applySizePreset("compact")}
                    aria-label="Compact size"
                    title="Compact"
                  >
                    <PanelBottomClose className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => applySizePreset("large")}
                    aria-label="Large size"
                    title="Large"
                  >
                    <PanelBottom className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => applySizePreset("max")}
                    aria-label="Max size"
                    title="Max"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsCollapsed((v) => !v)}
                aria-label={isCollapsed ? "Expand Ava chat" : "Collapse Ava chat"}
                title={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                aria-label="Close Ava chat"
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!isCollapsed && (
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto bg-muted/50 px-3 py-3"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Ava conversation"
            >
              {messages.length === 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">{"G'day — what are we working on?"}</p>
                  <div className="flex flex-col gap-2">
                    {starterChips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        disabled={isSending}
                        onClick={() => void sendMessage(chip)}
                        className="interactive-tint rounded-input border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-table-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div key={idx} className="flex min-w-0 flex-col gap-1">
                  {shouldShowTurnSeparator(messages, idx) ? (
                    <p className="py-1 text-center text-[11px] text-muted-foreground">
                      {msg.createdAt ? formatTurnStamp(msg.createdAt) : "Earlier"}
                    </p>
                  ) : null}
                  {msg.role === "user" ? (
                    <ChatUserMessage content={displayMiAnswerText(msg.content)} />
                  ) : (
                    <ChatAssistantTurn
                      markdown={msg.content}
                      questionsSlot={
                        msg.questions?.length
                          ? msg.questions.map((question) => (
                              <ChatQuestionCard
                                key={`${idx}-${question.id}`}
                                question={question}
                                disabled={isSending}
                                onConfirm={(answerText) =>
                                  confirmQuestion(idx, question.id, answerText)
                                }
                              />
                            ))
                          : undefined
                      }
                      filesSlot={
                        msg.attachments?.length
                          ? msg.attachments.map((attachment, attachmentIdx) => (
                              <ChatFileCard
                                key={`${idx}-${attachment.fileName}-${attachmentIdx}`}
                                attachment={attachment}
                              />
                            ))
                          : undefined
                      }
                    />
                  )}
                </div>
              ))}

              {isSending && <ChatThinkingIndicator />}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}

          <div className="flex shrink-0 flex-col gap-2 border-t px-3 py-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  void handlePlanFileSelected(e.target.files?.[0] ?? null)
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={isSending || isParsingPlan}
                aria-label="Attach publisher schedule"
                title="Attach publisher schedule (.xlsx)"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                placeholder={
                  pendingIngest?.missing
                    ? "Re-attach the xlsx to continue…"
                    : pendingIngest
                    ? "Confirm in chat to accept the ingest…"
                    : pendingParsedPlan
                      ? "Confirm to load lines into the form…"
                      : "Ask a question or drop an xlsx"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void sendMessage()
                  }
                }}
              />
              <Button
                onClick={() => void sendMessage()}
                disabled={isSending || isParsingPlan}
              >
                {isParsingPlan ? "Reviewing…" : "Send"}
              </Button>
            </div>
            {pendingIngest ? (
              pendingIngest.missing ? (
                <button
                  type="button"
                  className="text-left text-xs text-muted-foreground underline underline-offset-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {pendingIngestChipCopy(pendingIngest).text}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Pending ingest
                  {pendingIngest.fileName ? ` · ${pendingIngest.fileName}` : ""}
                  {pendingIngest.summary?.full_review_path ? (
                    <>
                      {" "}
                      ·{" "}
                      <a
                        className="underline underline-offset-2"
                        href={pendingIngest.summary.full_review_path}
                      >
                        Open full review
                      </a>
                    </>
                  ) : null}
                  . Confirm in chat to accept.
                </p>
              )
            ) : null}
            {pendingParsedPlan ? (
              <p className="text-xs text-muted-foreground">
                Pending {pendingParsedPlan.channel} parse
                {pendingParsedPlan.fileName
                  ? ` · ${pendingParsedPlan.fileName}`
                  : ""}
                . Confirm in chat to load into the form.
              </p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </div>
      )}
    </div>
  )
}

function coerceModelChatReply(data: any): ModelChatReply {
  // Preferred: server response already contains { replyText, patch }.
  if (data && typeof data === "object" && !Array.isArray(data) && typeof data.replyText === "string") {
    return {
      replyText: data.replyText,
      patch: isFormPatch(data.patch) ? data.patch : null,
      lineItemsLoad: isLineItemsLoad(data.lineItemsLoad) ? data.lineItemsLoad : null,
      attachments: coerceChatFileAttachments(data.attachments),
      questions: coerceChatInterviewQuestions(data.questions),
    }
  }

  // Fallback: older server/client paths may return a raw model string in `reply`.
  if (data && typeof data === "object" && typeof data.reply === "string") {
    try {
      const parsed = JSON.parse(stripJsonFences(data.reply))
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.replyText === "string") {
        return {
          replyText: parsed.replyText,
          patch: isFormPatch(parsed.patch) ? parsed.patch : null,
          lineItemsLoad: isLineItemsLoad(parsed.lineItemsLoad) ? parsed.lineItemsLoad : null,
          attachments: coerceChatFileAttachments(parsed.attachments),
          questions: coerceChatInterviewQuestions(parsed.questions),
        }
      }
    } catch {
      // ignore
    }
  }

  throw new Error("Sorry — I couldn’t understand that response. Please try again.")
}

function isLineItemsLoad(value: unknown): value is CapturedLineItemsLoad {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.channel !== "radio" && v.channel !== "ooh") return false
  if (!Array.isArray(v.items)) return false
  return true
}

async function collectCurrentLineItemsFromBridge(): Promise<{
  radio?: Record<string, unknown>[]
  ooh?: Record<string, unknown>[]
} | null> {
  const getLineItems = getAssistantContext()?.actions?.getLineItems
  if (typeof getLineItems !== "function") return null
  try {
    const [radioRes, oohRes] = await Promise.all([
      getLineItems({ channel: "radio" }),
      getLineItems({ channel: "ooh" }),
    ])
    const radio = Array.isArray(radioRes?.items) ? radioRes.items : undefined
    const ooh = Array.isArray(oohRes?.items) ? oohRes.items : undefined
    if (!radio && !ooh) return null
    return {
      ...(radio ? { radio } : {}),
      ...(ooh ? { ooh } : {}),
    }
  } catch {
    return null
  }
}

async function maybeApplyLineItemsLoad({
  load,
  appendAssistantNote,
}: {
  load: CapturedLineItemsLoad | null
  appendAssistantNote: (content: string) => void
}): Promise<boolean> {
  if (!load?.items?.length) return false
  const ctx = getAssistantContext()
  const setLineItems = ctx?.actions?.setLineItems
  if (typeof setLineItems !== "function") {
    appendAssistantNote(
      "Parsed lines are ready, but this page has not registered setLineItems yet. Open create/edit media plan and try again.",
    )
    return true
  }
  try {
    const note = await setLineItems({
      channel: load.channel,
      items: load.items,
      replace: load.replace !== false,
    })
    if (typeof note === "string" && note.trim()) {
      appendAssistantNote(note)
    } else {
      appendAssistantNote(
        `Loaded ${load.items.length} ${load.channel} line item(s) into the form for review.`,
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    appendAssistantNote(`Could not load line items into the form: ${message}`)
  }
  return true
}

function stripJsonFences(raw: string) {
  return raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
}

function isFormPatch(patch: unknown): patch is FormPatch {
  if (patch === null) return true as any
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false
  const updates = (patch as any).updates
  if (!Array.isArray(updates)) return false
  for (const u of updates) {
    if (!u || typeof u !== "object") return false
    if (typeof (u as any).fieldId !== "string") return false
  }
  return true
}

async function maybeApplyPatch({
  patch,
  pageContext,
  saveSelectorProp,
  appendAssistantNote,
}: {
  patch: FormPatch | null
  pageContext: PageContext | undefined
  saveSelectorProp: string | undefined
  appendAssistantNote: (content: string) => void
}): Promise<boolean> {
  if (!patch?.updates?.length) return false

  const ctx = getAssistantContext()
  const actions = ctx?.actions
  const setField = actions?.setField
  if (typeof setField !== "function") {
    appendAssistantNote("I have updates to apply, but this page hasn’t registered form edit handlers yet.")
    return true
  }

  for (const update of patch.updates) {
    try {
      await setField({ fieldId: update.fieldId, value: update.value })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      appendAssistantNote(`Could not update ${update.fieldId}: ${message}`)
    }
  }

  const saveSelectorFromContext =
    pageContext && typeof (pageContext as any).saveSelector === "string" ? (pageContext as any).saveSelector : undefined
  const selectorToClick = saveSelectorProp || saveSelectorFromContext
  if (selectorToClick && typeof actions?.click === "function") {
    try {
      await actions.click({ selector: selectorToClick })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      appendAssistantNote(`Saved changes could not be clicked automatically: ${message}`)
    }
  }

  return true
}

function extractActionFromReply(reply: string): any | null {
  if (!reply) return null
  const fence = /```json\s*([\s\S]*?)\s*```/i.exec(reply)
  const candidate = fence ? fence[1] : reply
  try {
    const parsed = JSON.parse(candidate)
    if (parsed && typeof parsed === "object" && "action" in parsed) return parsed
  } catch {
    // ignore
  }
  return null
}

async function maybeHandleAssistantAction(reply: string, appendAssistantNote: (content: string) => void) {
  const action = extractActionFromReply(reply)
  if (!action?.action) return

  const ctx = getAssistantContext()
  const actions = ctx?.actions
  const handler = actions?.[action.action as keyof typeof actions]
  if (typeof handler !== "function") return

  try {
    const result = await handler(action as any)
    if (result) {
      appendAssistantNote(String(result))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed"
    appendAssistantNote(`Action error: ${message}`)
  }
}

async function maybeHandleAssistantActionObject(data: any, appendAssistantNote: (content: string) => void) {
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.action !== "string") return
  const ctx = getAssistantContext()
  const actions = ctx?.actions
  const handler = actions?.[data.action as keyof typeof actions]
  if (typeof handler !== "function") return

  try {
    const result = await handler(data as any)
    if (result) appendAssistantNote(String(result))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed"
    appendAssistantNote(`Action error: ${message}`)
  }
}
