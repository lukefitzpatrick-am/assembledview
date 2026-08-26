export function ChatThinkingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Ava is thinking"
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <span className="flex items-center gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none" />
        <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse motion-reduce:animate-none [animation-delay:300ms]" />
      </span>
      <span>Thinking</span>
    </div>
  )
}
