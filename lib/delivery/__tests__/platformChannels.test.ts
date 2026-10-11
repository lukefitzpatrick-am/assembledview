import assert from "node:assert/strict"
import test from "node:test"

import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"

import {
  NON_PLATFORM_MEDIA_LABELS,
  PLATFORM_MEDIA_LABELS,
  isPlatformMediaType,
  splitMediaBreakdown,
} from "../platformChannels"

test("every MEDIA_TYPE_LABELS entry is classified, with no label missing", () => {
  const labels = Object.values(MEDIA_TYPE_LABELS)
  const classified = new Set<string>([...PLATFORM_MEDIA_LABELS, ...NON_PLATFORM_MEDIA_LABELS])

  assert.equal(classified.size, labels.length)
  for (const label of labels) {
    assert.equal(classified.has(label), true, label)
    assert.equal(typeof isPlatformMediaType(label), "boolean")
    assert.equal(isPlatformMediaType(label), PLATFORM_MEDIA_LABELS.has(label))
  }
  for (const label of PLATFORM_MEDIA_LABELS) {
    assert.equal(NON_PLATFORM_MEDIA_LABELS.has(label), false, label)
  }
})

test("search $100 and radio $50 is amount 150 and platformAmount 100", () => {
  assert.deepEqual(splitMediaBreakdown({ Search: 100, Radio: 50 }), {
    amount: 150,
    platformAmount: 100,
  })
})
