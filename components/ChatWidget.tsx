"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { getAssistantContext } from "@/lib/assistantBridge"
import type { FormPatch, ModelChatReply, PageContext } from "@/lib/openai"
import type { ChatMode } from "@/src/ava/modes"

type ChatWidgetProps = {
  getPageContext?: () => Promise<PageContext | undefined> | PageContext | undefined
  pageContext?: PageContext
  saveSelector?: string
  mode?: ChatMode
  initialMessages?: ChatCompletionMessageParam[]
  className?: string
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
  const [isSending, setIsSending] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatCompletionMessageParam[]>(initialMessages)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragState, setDragState] = useState<{ offsetX: number; offsetY: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragMovedRef = useRef(false)

  const appendAssistantNote = useCallback(
    (content: string) => setMessages((prev) => [...prev, { role: "assistant", content }]),
    []
  )

  const toggle = useCallback(() => setIsOpen((v) => !v), [])

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

  async function sendMessage() {
    if (!input.trim()) return
    setIsSending(true)
    setError(null)
    const updatedMessages: ChatCompletionMessageParam[] = [...messages, { role: "user", content: input.trim() }]
    setMessages(updatedMessages)
    setInput("")

    try {
      const resolvedPageContext =
        typeof getPageContext === "function" ? await getPageContext() : pageContext

      const payload = {
        messages: updatedMessages,
        pageContext: resolvedPageContext,
        mode,
      }

      const response = await fetch("/api/chat", {
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
      const assistantContent = parsedReply.replyText
      const assistantMessage: ChatCompletionMessageParam = { role: "assistant", content: assistantContent }
      setMessages((prev) => [...prev, assistantMessage])

      const didApplyPatch = await maybeApplyPatch({
        patch: parsedReply.patch,
        pageContext: resolvedPageContext,
        saveSelectorProp: saveSelector,
        appendAssistantNote,
      })

      // Legacy fallback (secondary): action JSON embedded in replyText, or response includes { action: ... }.
      if (!didApplyPatch) {
        await maybeHandleAssistantAction(assistantContent, appendAssistantNote)
        await maybeHandleAssistantActionObject(data, appendAssistantNote)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message"
      setError(message)
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry, something went wrong: ${message}` }])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div
      className={cn("fixed bottom-6 right-6 z-50", className)}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <Button
        onMouseDown={startDrag}
        onClick={handleToggleClick}
        className={cn(
          "rounded-full shadow-lg cursor-grab active:cursor-grabbing",
          isDragging && "cursor-grabbing"
        )}
        size="lg"
        variant={isOpen ? "secondary" : "default"}
      >
        {isOpen ? "Close AVA" : "Ask AVA"}
      </Button>

      {isOpen && (
        <div className="mt-3 w-96 rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div
              className={cn(
                "cursor-grab select-none",
                isDragging && "cursor-grabbing"
              )}
              onMouseDown={startDrag}
            >
              <p className="text-sm font-semibold text-slate-900">AssembledView Assistant</p>
              <p className="text-xs text-slate-500">Ask about this page, Xano data, or delivery</p>
            </div>
          </div>

          <div className="flex h-80 flex-col gap-3 overflow-y-auto bg-slate-50 px-3 py-3">
            {messages.length === 0 && <p className="text-sm text-slate-500">How can I help?</p>}

            {messages.map((msg, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <p
                  className={cn(
                    "max-w-[90%] whitespace-pre-line rounded-lg px-3 py-2 text-sm shadow-sm",
                    msg.role === "user"
                      ? "ml-auto bg-blue-600 text-white"
                      : "mr-auto bg-white text-slate-800 border border-slate-200"
                  )}
                >
                  {msg.content as string}
                </p>
              </div>
            ))}

            {isSending && <p className="text-xs text-slate-500">Thinking...</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <div className="flex items-center gap-2 border-t px-3 py-3">
            <Input
              placeholder="Ask a question"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
            />
            <Button onClick={sendMessage} disabled={isSending}>
              Send
            </Button>
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
        }
      }
    } catch {
      // ignore
    }
  }

  throw new Error("Sorry — I couldn’t understand that response. Please try again.")
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
