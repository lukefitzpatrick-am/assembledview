import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"

import { cn } from "@/lib/utils"
import {
  splitMarkdownBlocks,
  type ChatTableBlock,
} from "@/lib/ava/chatTurnBlocks"

const MARKDOWN_ELEMENTS = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "a",
  "code",
  "pre",
] as const

function safeHref(url: string): string {
  const trimmed = url.trim()
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
  return ""
}

const proseComponents: Components = {
  h1: ({ children }) => (
    <h3 className="text-sm font-semibold text-foreground">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="text-sm font-semibold text-foreground">{children}</h3>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-foreground">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-xs font-semibold text-muted-foreground">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="leading-relaxed text-foreground">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-4 text-foreground">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-4 text-foreground">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-foreground">{children}</em>,
  a: ({ href, children }) => {
    const safe = href ? safeHref(href) : ""
    if (!safe) return <span>{children}</span>
    return (
      <a
        href={safe}
        target={safe.startsWith("mailto:") ? undefined : "_blank"}
        rel={safe.startsWith("mailto:") ? undefined : "noopener noreferrer"}
        className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        {children}
      </a>
    )
  },
  code: ({ className, children }) => {
    const fenced = Boolean(className)
    if (fenced) {
      return <code className={cn("font-mono text-xs", className)}>{children}</code>
    }
    return (
      <code className="rounded-input bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="min-w-0 max-w-full overflow-x-auto rounded-input bg-muted p-2 text-xs text-foreground">
      {children}
    </pre>
  ),
}

const NUMERIC_CELL =
  /^-?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?$|^-?\d+(?:\.\d+)?%?$|^-?\d+(?:\s*\/\s*-?\d+)+$/

export function cellLooksNumeric(value: string): boolean {
  return NUMERIC_CELL.test(value.trim())
}

function columnLooksNumeric(rows: string[][], col: number): boolean {
  const values = rows.map((row) => (row[col] ?? "").trim()).filter(Boolean)
  return values.length > 0 && values.every(cellLooksNumeric)
}

export function ChatMarkdownProse({ markdown }: { markdown: string }) {
  return (
    <div className="min-w-0 max-w-full space-y-2">
      <ReactMarkdown
        allowedElements={[...MARKDOWN_ELEMENTS]}
        unwrapDisallowed
        urlTransform={safeHref}
        components={proseComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

export function ChatMarkdownTable({ block }: { block: ChatTableBlock }) {
  const numericCols = block.headers.map((_, col) => columnLooksNumeric(block.rows, col))
  const alignClass = (col: number) => {
    const align = numericCols[col] ? "right" : (block.alignments[col] ?? "left")
    if (align === "right") return "text-right"
    if (align === "center") return "text-center"
    return "text-left"
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border">
            {block.headers.map((header, col) => (
              <th
                key={`${header}-${col}`}
                className={cn(
                  "px-2 py-1.5 font-medium text-muted-foreground",
                  alignClass(col),
                  numericCols[col] ? "num" : null,
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="border-b border-border last:border-0">
              {block.headers.map((_, col) => (
                <td
                  key={col}
                  className={cn(
                    "whitespace-nowrap px-2 py-1.5 text-foreground",
                    alignClass(col),
                    numericCols[col] ? "num" : null,
                  )}
                >
                  {row[col] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChatAssistantMarkdown({ markdown }: { markdown: string }) {
  const blocks = splitMarkdownBlocks(markdown)
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2">
      {blocks.map((block, idx) =>
        block.type === "table" ? (
          <ChatMarkdownTable key={idx} block={block} />
        ) : (
          <ChatMarkdownProse key={idx} markdown={block.text} />
        ),
      )}
    </div>
  )
}
