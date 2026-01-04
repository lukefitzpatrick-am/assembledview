"use client"

import { useCallback, useState } from "react"
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { getAssistantContext, getAssistantSummary } from "@/lib/assistantBridge"
import { getPageDataSummary as summarizePageData } from "@/lib/pageData"

type ChatWidgetProps = {
  getPageDataSummary?: () => Promise<string | undefined> | string | undefined
  systemInstructions?: string
  initialMessages?: ChatCompletionMessageParam[]
  className?: string
}

export function ChatWidget({
  getPageDataSummary,
  systemInstructions,
  initialMessages = [],
  className,
}: ChatWidgetProps) {
  const actionInstruction =
    [
      "When the user asks to change on-page data, include a JSON block in triple backticks. Supported shapes:",
      '- {"action":"updateBurstBudget","mediaType":"search","burstIndex":0,"budget":12345}',
      '- {"action":"setField","fieldId":"mp_campaignbudget","value":"50000"}',
      '- {"action":"setField","selector":"input[name=mp_campaignname]","value":"New name"}',
      '- {"action":"click","selector":"button[data-test=save-plan]"}',
      '- {"action":"select","selector":"select[name=mp_campaignstatus]","value":"On Hold"}',
      '- {"action":"toggle","selector":"input[type=checkbox][name=mp_search]","value":true}',
      "Only emit an action when confident; otherwise ask a clarifying question.",
    ].join(" ")

  const [isOpen, setIsOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatCompletionMessageParam[]>(initialMessages)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadContext, setUploadContext] = useState<any | null>(null)

  const appendAssistantNote = useCallback(
    (content: string) => setMessages((prev) => [...prev, { role: "assistant", content }]),
    []
  )

  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    Array.from(files).forEach((file) => formData.append("files", file))

    setIsUploading(true)
    setError(null)

    try {
      const response = await fetch("/api/processPlan", {
        method: "POST",
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Upload failed")

      setUploadContext(data)
      const summary =
        `Uploaded ${data.sources?.length || 0} file(s); extracted ${data.items?.length || 0} items.` +
        (data.sources?.[0]?.fileName ? ` First file: ${data.sources[0].fileName}` : "")
      appendAssistantNote(summary)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setError(message)
      appendAssistantNote(`Upload error: ${message}`)
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }, [appendAssistantNote])

  async function sendMessage() {
    if (!input.trim()) return
    setIsSending(true)
    setError(null)
    const updatedMessages: ChatCompletionMessageParam[] = [...messages, { role: "user", content: input.trim() }]
    setMessages(updatedMessages)
    setInput("")

    try {
      const pageDataFromProp =
        typeof getPageDataSummary === "function" ? await getPageDataSummary() : getPageDataSummary
      const assistantSummary = getAssistantSummary()
      const fallbackPageData =
        typeof window !== "undefined"
          ? // Optional global spot where pages can attach data for the assistant
            (window as any).__ASSEMBLED_VIEW_DATA ||
            (window as any).__AV_PAGE_DATA ||
            (window as any).__PAGE_DATA__
          : undefined
      const combinedSummary = {
        page: pageDataFromProp ?? assistantSummary ?? fallbackPageData,
        uploads: uploadContext
          ? {
              sources: uploadContext.sources,
              itemsPreview: uploadContext.items?.slice(0, 20),
              totalItems: uploadContext.items?.length,
            }
          : undefined,
      }
      const pageDataSummary = summarizePageData(combinedSummary ?? fallbackPageData)

      const payload = {
        messages: updatedMessages,
        pageDataSummary,
        systemInstructions: [systemInstructions, actionInstruction].filter(Boolean).join("\n\n"),
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Chat failed")

      const assistantMessage: ChatCompletionMessageParam = { role: "assistant", content: data.reply }
      setMessages((prev) => [...prev, assistantMessage])
      await maybeHandleAssistantAction(data.reply, appendAssistantNote)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message"
      setError(message)
      setMessages((prev) => [...prev, { role: "assistant", content: `Sorry, something went wrong: ${message}` }])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={cn("fixed bottom-6 right-6 z-50", className)}>
      <Button
        onClick={toggle}
        className="rounded-full shadow-lg"
        size="lg"
        variant={isOpen ? "secondary" : "default"}
      >
        {isOpen ? "Close Assistant" : "AI Assistant"}
      </Button>

      {isOpen && (
        <div className="mt-3 w-96 rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">AssembledView Assistant</p>
              <p className="text-xs text-slate-500">Ask about this page, Xano data, or upload results</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="chat-upload-input"
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp"
                onChange={handleUpload}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={isUploading}
                onClick={() => document.getElementById("chat-upload-input")?.click()}
              >
                {isUploading ? "Uploading..." : "Upload"}
              </Button>
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

