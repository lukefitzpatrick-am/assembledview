import assert from "node:assert/strict"
import test from "node:test"
import { filterPublishersWithMediaTypeSlug } from "../../publisher/publisherKpiMediaOptions.js"
import type { Publisher } from "../../types/publisher.js"

function publisherWith(flags: Partial<Publisher>): Publisher {
  return {
    publisherid: "p1",
    publisher_name: "Test Pub",
    pub_television: false,
    pub_radio: false,
    pub_newspaper: false,
    pub_magazines: false,
    pub_ooh: false,
    pub_cinema: false,
    pub_digidisplay: false,
    pub_digiaudio: false,
    pub_digivideo: false,
    pub_bvod: false,
    pub_integration: false,
    pub_search: false,
    pub_socialmedia: false,
    pub_progdisplay: false,
    pub_progvideo: false,
    pub_progbvod: false,
    pub_progaudio: false,
    pub_progooh: false,
    pub_influencers: false,
    ...flags,
  } as Publisher
}

test("filterPublishersWithMediaTypeSlug accepts digiDisplay resolver alias", () => {
  const pubs = [
    publisherWith({ pub_digidisplay: true, publisher_name: "Display Co" }),
    publisherWith({ pub_search: true, publisher_name: "Search Co" }),
  ]
  const filtered = filterPublishersWithMediaTypeSlug(pubs, "digiDisplay")
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.publisher_name, "Display Co")
})

test("filterPublishersWithMediaTypeSlug accepts digitalDisplay hub slug", () => {
  const pubs = [publisherWith({ pub_digivideo: true, publisher_name: "Video Co" })]
  const filtered = filterPublishersWithMediaTypeSlug(pubs, "digitalVideo")
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0]?.publisher_name, "Video Co")
})
