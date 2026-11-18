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
    // tabIndex: a refused save moves focus here when no field is marked invalid (B58 `showSaveStop`).
    <p role="alert" data-date-order-error="" tabIndex={-1} className="text-sm font-medium text-destructive">
      {END_BEFORE_START_MESSAGE}
    </p>
  )
}
