import { describe, expect, it } from "vitest"
import { classifyScheduleShape } from "@/lib/finance/rows/scheduleShape"

describe("classifyScheduleShape", () => {
  it("classifies absent / empty forms", () => {
    expect(classifyScheduleShape(null)).toBe("absent")
    expect(classifyScheduleShape(undefined)).toBe("absent")
    expect(classifyScheduleShape("")).toBe("empty-string")
    expect(classifyScheduleShape("   ")).toBe("empty-string")
    expect(classifyScheduleShape({})).toBe("empty-object")
    expect(classifyScheduleShape([])).toBe("empty-array")
    expect(classifyScheduleShape({ months: [] })).toBe("empty-array")
  })

  it("classifies arrays and months wrappers", () => {
    expect(classifyScheduleShape([{ month: "2026-01" }])).toBe("array(1)")
    expect(classifyScheduleShape({ months: [{}, {}] })).toBe("array(2)")
  })

  it("classifies JSON strings by their parsed shape", () => {
    expect(classifyScheduleShape("{}")).toBe("empty-object")
    expect(classifyScheduleShape("[]")).toBe("empty-array")
    expect(classifyScheduleShape('{"months":[{}]}')).toBe("array(1)")
    expect(classifyScheduleShape("not-json")).toBe("unparseable")
  })
})
