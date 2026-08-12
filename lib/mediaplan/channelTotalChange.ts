/**
 * Apply a channel media/fee total pair without impure setState updaters.
 * Compare against refs outside setState, write plain next values, then mark dirty.
 * Returns true when either value changed (and markDirty was invoked).
 */
export function applyChannelTotalPair(args: {
  mediaRef: { current: number }
  feeRef: { current: number }
  setMedia: (next: number) => void
  setFee: (next: number) => void
  totalMedia: number
  totalFee: number
  markDirty: () => void
}): boolean {
  const {
    mediaRef,
    feeRef,
    setMedia,
    setFee,
    totalMedia,
    totalFee,
    markDirty,
  } = args
  if (mediaRef.current === totalMedia && feeRef.current === totalFee) {
    return false
  }
  mediaRef.current = totalMedia
  feeRef.current = totalFee
  setMedia(totalMedia)
  setFee(totalFee)
  markDirty()
  return true
}
