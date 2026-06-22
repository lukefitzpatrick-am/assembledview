import { useEffect, useRef } from "react"

/**
 * Seam 1: shared edit-mode hydration control flow.
 * Owns the modal-open guard, the empty guard, and an IDENTITY guard so a
 * container only re-hydrates when the initialLineItems REFERENCE changes
 * (real load or version switch), never on a campaign-date change. This is
 * the Integration/Radio pattern, generalised. The per-channel transform and
 * form.reset stay in the caller's `hydrate` callback, unchanged.
 */
export function useStableHydration<T>(
  initialLineItems: T[] | undefined | null,
  hydrate: (items: T[]) => void,
  modalOpenRef?: { current: boolean },
): void {
  const lastHydratedRef = useRef<T[] | null>(null)
  const hydrateRef = useRef(hydrate)
  hydrateRef.current = hydrate
  useEffect(() => {
    if (modalOpenRef?.current) return
    if (!initialLineItems || initialLineItems.length === 0) return
    if (lastHydratedRef.current === initialLineItems) return
    lastHydratedRef.current = initialLineItems
    hydrateRef.current(initialLineItems)
  }, [initialLineItems, modalOpenRef])
}
