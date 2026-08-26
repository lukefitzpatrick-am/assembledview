import type { ReactNode } from "react"

import { composeAssistantTurn } from "@/lib/ava/chatTurnBlocks"

import { ChatMarkdownProse, ChatMarkdownTable } from "./ChatAssistantMarkdown"

type ChatAssistantTurnProps = {
  markdown: string
  questionsSlot?: ReactNode
  filesSlot?: ReactNode
}

export function ChatAssistantTurn({
  markdown,
  questionsSlot,
  filesSlot,
}: ChatAssistantTurnProps) {
  const blocks = composeAssistantTurn({
    markdown,
    hasQuestions: Boolean(questionsSlot),
    hasFiles: Boolean(filesSlot),
  })

  return (
    <div className="mr-auto flex w-full min-w-0 max-w-full flex-col gap-2 border-l-2 border-primary/40 pl-3 text-sm text-foreground">
      {blocks.map((block, idx) => {
        if (block.type === "markdown") {
          return <ChatMarkdownProse key={idx} markdown={block.text} />
        }
        if (block.type === "table") {
          return <ChatMarkdownTable key={idx} block={block} />
        }
        if (block.type === "questions") {
          return (
            <div key={idx} className="flex min-w-0 w-full flex-col gap-2">
              {questionsSlot}
            </div>
          )
        }
        return (
          <div key={idx} className="flex min-w-0 w-full flex-col gap-2">
            {filesSlot}
          </div>
        )
      })}
    </div>
  )
}
