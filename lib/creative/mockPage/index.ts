/**
 * Server-only entry for live-URL mock page helpers.
 * Client code must call POST /api/creative-assets/mock-page — never import this barrel.
 */
import "server-only"

export { fetchHtmlSafe, MockPageFetchError } from "./fetchSafe"
export { checkMockPageRateLimit } from "./rateLimit"
export { isPrivateOrReservedIp } from "./privateIp"
export {
  rewriteMockPage,
  summarizeSlots,
  IAB_SIZES,
  type CreativeInject,
  type DetectedSlot,
  type RewriteResult,
} from "./rewritePage"
