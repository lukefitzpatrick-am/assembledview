"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import ReactMarkdown from "react-markdown"

import { AvaCreateClientBrainAction } from "@/components/ava/AvaSkillActionSets"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

function formatBrainUpdatedAt(raw: unknown): string | null {
  const d =
    typeof raw === "number" && Number.isFinite(raw)
      ? new Date(raw)
      : typeof raw === "string" && raw.trim()
        ? new Date(raw)
        : null
  if (!d || Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export type ClientBrainCardProps = {
  clientName: string
  record?: Record<string, unknown> | null
  className?: string
}

export function ClientBrainCard({
  clientName,
  record,
  className,
}: ClientBrainCardProps) {
  const brain =
    typeof record?.client_brain === "string" ? record.client_brain.trim() : ""
  const updatedLabel = formatBrainUpdatedAt(record?.client_brain_updated_at)
  const [open, setOpen] = useState(Boolean(brain))

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section
        className={cn(
          "rounded-card border border-border bg-card shadow-e1",
          className,
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <CollapsibleTrigger
            className="interactive-tint flex min-w-0 flex-1 items-center gap-2 rounded-input text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Client Brain
              </h2>
              {updatedLabel ? (
                <p className="text-xs text-muted-foreground">
                  Last updated {updatedLabel}
                </p>
              ) : null}
            </div>
          </CollapsibleTrigger>
          <AvaCreateClientBrainAction clientName={clientName} />
        </div>

        <CollapsibleContent>
          <div className="px-4 py-4 sm:px-5">
            {brain ? (
              <div className="space-y-3 text-sm text-foreground">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h3 className="text-base font-semibold text-foreground">{children}</h3>
                    ),
                    h2: ({ children }) => (
                      <h4 className="mt-4 text-sm font-semibold text-foreground">{children}</h4>
                    ),
                    h3: ({ children }) => (
                      <h5 className="mt-3 text-sm font-medium text-foreground">{children}</h5>
                    ),
                    p: ({ children }) => (
                      <p className="leading-relaxed text-foreground">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc space-y-1 pl-5 text-foreground">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal space-y-1 pl-5 text-foreground">{children}</ol>
                    ),
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-foreground">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="text-muted-foreground">{children}</em>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {children}
                      </a>
                    ),
                    code: ({ children }) => (
                      <code className="rounded-input bg-muted px-1 py-0.5 text-xs">{children}</code>
                    ),
                  }}
                >
                  {brain}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No brain yet — ask AVA to create the marketing brain for this
                client.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
