type BrandLoadingProps = {
  text: string
}

/** Dot mark with a short line. Pulse is off when the user prefers reduced motion. */
export function BrandLoading({ text }: BrandLoadingProps) {
  return (
    <div className="flex flex-col items-center gap-4" role="status">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-0.5 -0.5 147.5 147.5"
        className="h-12 w-12 animate-pulse fill-am-lime motion-reduce:animate-none"
        aria-hidden
      >
        <circle cx="49" cy="8" r="8.5" />
        <circle cx="97.5" cy="8" r="8.5" />
        <circle cx="8" cy="49" r="8.5" />
        <circle cx="138.5" cy="49" r="8.5" />
        <circle cx="49" cy="49" r="16.5" />
        <circle cx="97.5" cy="49" r="16.5" />
        <circle cx="49" cy="97.5" r="16.5" />
        <circle cx="97.5" cy="97.5" r="16.5" />
        <circle cx="8" cy="97.5" r="8.5" />
        <circle cx="138.5" cy="97.5" r="8.5" />
        <circle cx="49" cy="138.5" r="8.5" />
        <circle cx="97.5" cy="138.5" r="8.5" />
      </svg>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
