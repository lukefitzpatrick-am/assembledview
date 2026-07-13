import "server-only"

import { screenshotOneProvider } from "./screenshotone"

export type LiveMockupRender = {
  url: string
  injectScript: string | null
  fullPage: boolean
  viewportWidth: number
  countryCode: "au"
}

export interface LiveMockupProvider {
  name: string
  render(req: LiveMockupRender): Promise<{ image: Buffer; contentType: string }>
}

export function getLiveMockupProvider(): LiveMockupProvider | null {
  // Prefer ScreenshotOne docs name; also accept SCREENSHOT_ACCESS from local .env.
  const accessKey =
    process.env.SCREENSHOTONE_ACCESS_KEY?.trim() ||
    process.env.SCREENSHOT_ACCESS?.trim()
  if (!accessKey) return null
  return screenshotOneProvider(accessKey)
}
