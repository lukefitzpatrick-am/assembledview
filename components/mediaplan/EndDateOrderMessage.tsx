import { END_BEFORE_START_MESSAGE, endIsBeforeStart } from "@/lib/mediaplan/dateOrder"

export function EndDateOrderMessage({
  start,
  end,
}: {
  start: unknown
  end: unknown
}) {
  if (!endIsBeforeStart(start, end)) return null
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {END_BEFORE_START_MESSAGE}
    </p>
  )
}
