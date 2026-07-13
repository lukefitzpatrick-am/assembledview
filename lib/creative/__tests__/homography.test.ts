import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyHomography, computeHomography, type Point2 } from "../homography"

describe("computeHomography", () => {
  it("maps unit square corners to themselves for identity quad", () => {
    const unit: Point2[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    const H = computeHomography(unit, unit)
    for (const p of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5],
    ] as const) {
      const [x, y] = applyHomography(H, p[0], p[1])
      assert.ok(Math.abs(x - p[0]) < 1e-4)
      assert.ok(Math.abs(y - p[1]) < 1e-4)
    }
  })
})
