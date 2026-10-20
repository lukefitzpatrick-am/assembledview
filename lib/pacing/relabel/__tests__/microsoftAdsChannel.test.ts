import assert from "node:assert/strict"
import test from "node:test"

import { cardChannelFromWarehouse, factRouteForChannel } from "../shared/channels.js"
import { defaultWarehouseChannel } from "../shared/relabelPageUrl.js"
import {
  RELABEL_WAREHOUSE_CHANNELS,
  SEARCH_PACING_CHANNELS,
  SEARCH_PACING_FACT,
} from "../shared/types.js"

const BING = "Search - Microsoft Ads"

test("Microsoft Ads search is a search pacing channel on SEARCH_PACING_FACT", () => {
  assert.ok((SEARCH_PACING_CHANNELS as readonly string[]).includes(BING))
  assert.ok((RELABEL_WAREHOUSE_CHANNELS as readonly string[]).includes(BING))
  const route = factRouteForChannel(BING)
  assert.equal(route.table, SEARCH_PACING_FACT)
  assert.equal(route.primaryKey, "platform_line_item_id")
  assert.equal(route.fallbackKey, null)
  assert.equal(route.updateLineItemName, false)
  assert.equal(cardChannelFromWarehouse(BING), "search")
})

test("a Bing plan line defaults to the Microsoft Ads warehouse channel", () => {
  assert.equal(defaultWarehouseChannel("search", "Bing - AM"), BING)
  assert.equal(defaultWarehouseChannel("search", "Microsoft Ads"), BING)
  assert.equal(defaultWarehouseChannel("search", "Google Ads - AM"), "Search - Google Ads")
  assert.equal(defaultWarehouseChannel("search", "PMax"), "PMax - Google Ads")
})
