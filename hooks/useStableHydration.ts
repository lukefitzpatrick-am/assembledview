import { useEffect, useRef } from "react"

/**
 * Seam 1: shared edit-mode hydration control flow.
 * Owns the modal-open guard, the empty guard, and an IDENTITY guard so a
 * container only re-hydrates when the initialLineItems REFERENCE changes
 * (real load or version switch), never on a campaign-date change. This is
 * the Integration/Radio pattern, generalised. The per-channel transform and
 * form.reset stay in the caller's `hydrate` callback, unchanged.
 *
 * Create echoes Radio and OOH publishes back as `initialLineItems`. Pass that
 * array on `ownPublishRef` (set inside the publish callback, same reference).
 * The echo is marked seen and does not reset or collapse. A different array
 * (ingest, draft restore, edit load) still hydrates.
 */
export function useStableHydration<T>(
  initialLineItems: T[] | undefined | null,
  hydrate: (items: T[]) => void,
  modalOpenRef?: { current: boolean },
  ownPublishRef?: { current: T[] | null },
): void {
  const lastHydratedRef = useRef<T[] | null>(null)
  const hydrateRef = useRef(hydrate)
  hydrateRef.current = hydrate
  useEffect(() => {
    if (modalOpenRef?.current) return
    if (initialLineItems == null) return
    // First paint is often [] while the tip fetch is in flight — skip that.
    // After a real hydrate, a new empty array is a deleted-line resume.
    if (initialLineItems.length === 0 && lastHydratedRef.current == null) return
    if (lastHydratedRef.current === initialLineItems) return
    if (ownPublishRef && initialLineItems === ownPublishRef.current) {
      lastHydratedRef.current = initialLineItems
      return
    }
    lastHydratedRef.current = initialLineItems
    hydrateRef.current(initialLineItems)
  }, [initialLineItems, modalOpenRef, ownPublishRef])
}
