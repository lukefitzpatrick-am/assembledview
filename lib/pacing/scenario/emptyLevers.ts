import type { ScenarioLevers } from "./types.js"

export const EMPTY_LEVERS: ScenarioLevers = {
  moves: [],
  caps: [],
  pauses: [],
  extendDays: 0,
  burstDateChanges: [],
}

export function leversFromInputs(input: {
  fromId: string
  toId: string
  moveAmount: number
  capLineId: string
  dailyCap: number
  extendDays: number
  pauses: string[]
  burstLineId: string
  burstIndex: number
  burstStart: string
  burstEnd: string
}): ScenarioLevers {
  const moves =
    input.moveAmount > 0 && input.fromId && input.toId && input.fromId !== input.toId
      ? [{ from: input.fromId, to: input.toId, amount: input.moveAmount }]
      : []
  const caps =
    input.dailyCap > 0 && input.capLineId
      ? [{ lineItemId: input.capLineId, dailyCap: input.dailyCap }]
      : []
  const burstDateChanges =
    input.burstLineId && input.burstStart && input.burstEnd
      ? [
          {
            lineItemId: input.burstLineId,
            index: input.burstIndex,
            start: input.burstStart,
            end: input.burstEnd,
          },
        ]
      : []
  return {
    moves,
    caps,
    pauses: input.pauses,
    extendDays: input.extendDays,
    burstDateChanges,
  }
}
