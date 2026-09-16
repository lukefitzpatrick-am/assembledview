import assert from "node:assert/strict"
import test from "node:test"

import { PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL } from "../types"

test("progOoh stamps snowflakeChannel programmatic-ooh", () => {
  assert.equal(PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progOoh, "programmatic-ooh")
})

test("existing families keep their CF-DASH channels", () => {
  assert.equal(PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progDisplay, "programmatic-display")
  assert.equal(PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progVideo, "programmatic-video")
  assert.equal(PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progBvod, "programmatic-video")
  assert.equal(PROGRAMMATIC_FAMILY_SNOWFLAKE_CHANNEL.progAudio, "programmatic-video")
})
