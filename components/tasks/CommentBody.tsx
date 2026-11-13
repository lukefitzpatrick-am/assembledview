/**
 * A comment's text with its @mentions as chips (B41). Only tokens the server
 * resolved and stored are chips; anything else stays as typed.
 */
import { Badge } from "@/components/ui/badge"
import { mentionSegments, type CommentMention } from "@/lib/codex/mentions"

export function CommentBody({ body, mentions }: { body: string; mentions?: readonly CommentMention[] | null }) {
  const segments = mentionSegments(body, mentions ?? [])
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {segments.map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <Badge key={i} variant="info" size="sm" className="mx-0.5 align-baseline" title={s.email} data-mention={s.email}>
            @{s.name}
          </Badge>
        )
      )}
    </p>
  )
}
