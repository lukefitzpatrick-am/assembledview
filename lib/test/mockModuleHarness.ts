import { mock } from "node:test"

/** Skip reason when `mock.module` is unavailable (Node 22+ with `--experimental-test-module-mocks`). */
export const MOCK_MODULE_SKIP_REASON =
  "mock.module requires Node 22+ with --experimental-test-module-mocks"

export function supportsMockModule(): boolean {
  return typeof mock.module === "function"
}

/** Use as `test(name, { skip: mockModuleSkip() }, fn)` — `false` means run. */
export function mockModuleSkip(): string | false {
  return supportsMockModule() ? false : MOCK_MODULE_SKIP_REASON
}
