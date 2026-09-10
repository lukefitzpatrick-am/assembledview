/**
 * Shared week-start preference: one localStorage key, every expert-grid owner.
 * Default Sunday. Private-mode / blocked site data must not throw.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import {
  WEEK_STARTS_ON_STORAGE_KEY,
  getWeekStartsOnSnapshot,
  persistWeekStartsOn,
  readStoredWeekStartsOn,
  resetWeekStartsOnStore,
  setWeekStartsOnStore,
  subscribeWeekStartsOn,
} from "@/lib/mediaplan/useWeekStartsOn"

const root = process.cwd()

const WEEK_START_OWNERS = [
  "components/media-containers/TelevisionContainer.tsx",
  "components/media-containers/RadioContainer.tsx",
  "components/media-containers/CinemaContainer.tsx",
  "components/media-containers/NewspaperContainer.tsx",
  "components/media-containers/MagazinesContainer.tsx",
  "components/media-containers/OOHContainer.tsx",
  "components/media-containers/DigitalDisplayContainer.tsx",
  "components/media-containers/DigitalVideoContainer.tsx",
  "components/media-containers/DigitalAudioContainer.tsx",
  "components/media-containers/BVODContainer.tsx",
  "components/media-containers/SocialMediaContainer.tsx",
  "components/media-containers/InfluencersContainer.tsx",
  "components/media-containers/IntegrationContainer.tsx",
  "components/media-containers/ProductionContainer.tsx",
  "lib/mediaplan/useMediaChannelContainer.ts",
] as const

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8")
}

type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function installLocalStorage(impl: StorageLike) {
  const g = globalThis as {
    window?: { localStorage: StorageLike }
    localStorage?: StorageLike
  }
  const prevWindow = g.window
  const prevLs = g.localStorage
  g.localStorage = impl
  g.window = { localStorage: impl }
  return () => {
    if (prevWindow === undefined) delete g.window
    else g.window = prevWindow
    if (prevLs === undefined) delete g.localStorage
    else g.localStorage = prevLs
  }
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  store: Record<string, string>
} {
  const store = { ...initial }
  return {
    store,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key]! : null
    },
    setItem(key, value) {
      store[key] = value
    },
  }
}

function withConsoleErrorGuard(fn: () => void) {
  const errors: unknown[][] = []
  const orig = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args)
  }
  try {
    fn()
    assert.equal(errors.length, 0, "must not console.error")
  } finally {
    console.error = orig
  }
}

test("nothing stored → Sunday", () => {
  const restore = installLocalStorage(memoryStorage())
  resetWeekStartsOnStore()
  try {
    assert.equal(readStoredWeekStartsOn(), 0)
    assert.equal(getWeekStartsOnSnapshot(), 0)
  } finally {
    resetWeekStartsOnStore()
    restore()
  }
})

test("set Monday, reload → Monday", () => {
  const ls = memoryStorage()
  const restore = installLocalStorage(ls)
  resetWeekStartsOnStore()
  try {
    persistWeekStartsOn(1)
    assert.equal(ls.store[WEEK_STARTS_ON_STORAGE_KEY], "1")
    resetWeekStartsOnStore()
    assert.equal(readStoredWeekStartsOn(), 1)
    assert.equal(getWeekStartsOnSnapshot(), 1)
  } finally {
    resetWeekStartsOnStore()
    restore()
  }
})

test("set Monday, close the grid, reopen → Monday", () => {
  const restore = installLocalStorage(memoryStorage())
  resetWeekStartsOnStore()
  try {
    setWeekStartsOnStore(1)
    assert.equal(getWeekStartsOnSnapshot(), 1)
    assert.equal(readStoredWeekStartsOn(), 1)
  } finally {
    resetWeekStartsOnStore()
    restore()
  }
})

test("set Monday on Television, open Radio → Monday", () => {
  const restore = installLocalStorage(memoryStorage())
  resetWeekStartsOnStore()
  try {
    const seen: number[] = []
    const unsubRadio = subscribeWeekStartsOn(() => {
      seen.push(getWeekStartsOnSnapshot())
    })
    setWeekStartsOnStore(1)
    assert.equal(getWeekStartsOnSnapshot(), 1)
    assert.deepEqual(seen, [1])
    unsubRadio()
  } finally {
    resetWeekStartsOnStore()
    restore()
  }
})

test("localStorage throwing → default Sunday, no crash, no console error", () => {
  const throwing: StorageLike = {
    getItem() {
      throw new Error("blocked")
    },
    setItem() {
      throw new Error("blocked")
    },
  }
  const restore = installLocalStorage(throwing)
  resetWeekStartsOnStore()
  try {
    withConsoleErrorGuard(() => {
      assert.equal(readStoredWeekStartsOn(), 0)
      persistWeekStartsOn(1)
      setWeekStartsOnStore(1)
      assert.equal(getWeekStartsOnSnapshot(), 1)
    })
  } finally {
    resetWeekStartsOnStore()
    restore()
  }
})

test("invalid stored value → Sunday", () => {
  const restore = installLocalStorage(memoryStorage({ [WEEK_STARTS_ON_STORAGE_KEY]: "9" }))
  resetWeekStartsOnStore()
  try {
    assert.equal(readStoredWeekStartsOn(), 0)
  } finally {
    resetWeekStartsOnStore()
    restore()
  }
})

test("all 15 owners use useWeekStartsOn with no local WeekStartsOn state", () => {
  assert.equal(WEEK_START_OWNERS.length, 15)
  for (const rel of WEEK_START_OWNERS) {
    const src = read(rel)
    assert.match(
      src,
      /useWeekStartsOn/,
      `${rel} must call useWeekStartsOn`
    )
    assert.doesNotMatch(
      src,
      /useState<WeekStartsOn>/,
      `${rel} must not keep local WeekStartsOn state`
    )
  }
})

test("ExpertGrid uncontrolled path reads the same store, not a Sunday useState", () => {
  const src = read("components/media-containers/ExpertGrid.tsx")
  assert.match(src, /useWeekStartsOn/)
  assert.doesNotMatch(src, /useState<WeekStartsOn>/)
  assert.doesNotMatch(src, /uncontrolledWeekStartsOn/)
})
