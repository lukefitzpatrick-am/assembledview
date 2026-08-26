export function ChatUserMessage({ content }: { content: string }) {
  return (
    <p className="ml-auto max-w-[90%] min-w-0 whitespace-pre-line rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
      {content}
    </p>
  )
}
