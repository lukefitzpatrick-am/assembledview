import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { canonicalPreviewUrl, previewSourceHash } from "@/lib/creative/previews/sourceHash"

const META_A =
  "https://scontent-syd2-1.xx.fbcdn.net/v/t45.1600-4/471234567_120210000000000001_n.jpg?stp=dst-jpg_p480x480&_nc_cat=105&ccb=1-7&_nc_sid=890911&_nc_ohc=AbCdEf123&_nc_ht=scontent-syd2-1.xx&oh=00_AYAbc111&oe=6716A1B2"
const META_B =
  "https://scontent.xx.fbcdn.net/v/t45.1600-4/471234567_120210000000000001_n.jpg?stp=dst-jpg_s600x600&_nc_cat=101&ccb=1-7&_nc_sid=890911&_nc_ohc=ZzYyXx987&_nc_oc=Adk&_nc_ht=scontent.xx&oh=00_AYAzz999&oe=671BE7C0"

describe("previewSourceHash", () => {
  it("gives two re-signed URLs for the same Meta image the same hash", () => {
    const a = previewSourceHash(META_A)
    const b = previewSourceHash(META_B)
    assert.ok(a)
    assert.equal(a, b)
    assert.match(a, /^[0-9a-f]{64}$/)
  })

  it("drops the signing and cache parameters and the host", () => {
    assert.equal(canonicalPreviewUrl(META_A), "/v/t45.1600-4/471234567_120210000000000001_n.jpg")
  })

  it("changes when the image path changes", () => {
    const other = META_A.replace("471234567_", "471234568_")
    assert.notEqual(previewSourceHash(META_A), previewSourceHash(other))
  })

  it("ignores TikTok x-expires and x-signature but keeps stable parameters", () => {
    const a =
      "https://p16-sign-sg.tiktokcdn.com/tos-alisg-p-0037/abc123~tplv-noop.image?x-expires=1729000000&x-signature=AAA%3D&biz_tag=tt_video"
    const b =
      "https://p19-sign-sg.tiktokcdn.com/tos-alisg-p-0037/abc123~tplv-noop.image?biz_tag=tt_video&x-signature=BBB%3D&x-expires=1729600000"
    assert.equal(previewSourceHash(a), previewSourceHash(b))
    assert.equal(canonicalPreviewUrl(a), "/tos-alisg-p-0037/abc123~tplv-noop.image?biz_tag=tt_video")
  })

  it("gives two syncs of the same TikTok video cover the same hash", () => {
    const a =
      "http://p16-sign-sg.tiktokcdn.com/tos-alisg-p-0051c001-sg/oMltZGVkATAiP8a5rzlG42kHBaIME4YA5B8iU~tplv-noop.image?dr=18692&refresh_token=b0939911&x-expires=1792454723&x-signature=7NFpEWaJMYmiaNwh0myPO%2FFcTLQ%3D&t=9276707c&ps=14f1eb3e&shp=9e36835a&shcp=623c3a84&idc=my2&VideoID=v10033g50000d4r6n57og65s61v0ddi0"
    const b =
      "http://p19-sign-sg.tiktokcdn.com/tos-alisg-p-0051c001-sg/oMltZGVkATAiP8a5rzlG42kHBaIME4YA5B8iU~tplv-noop.image?dr=18693&refresh_token=c1a4e702&x-expires=1792541123&x-signature=Qw9ZzR2bN1kLm0pXyVtUuS3aBcD%3D&t=8a1c33d0&ps=27b0aa91&shp=1f00c2d4&shcp=55aa0b19&idc=sg1&VideoID=v10033g50000d4r6n57og65s61v0ddi0"
    assert.equal(previewSourceHash(a), previewSourceHash(b))
    assert.equal(
      canonicalPreviewUrl(a),
      "/tos-alisg-p-0051c001-sg/oMltZGVkATAiP8a5rzlG42kHBaIME4YA5B8iU~tplv-noop.image?VideoID=v10033g50000d4r6n57og65s61v0ddi0",
    )
  })

  it("keeps two different TikTok covers apart", () => {
    const a =
      "http://p16-sign-sg.tiktokcdn.com/tos-alisg-p-0051c001-sg/oMltZGVkATAiP8a5rzlG42kHBaIME4YA5B8iU~tplv-noop.image?refresh_token=b0939911&VideoID=v10033g50000d4r6n57og65s61v0ddi0"
    const b =
      "http://p16-sign-sg.tiktokcdn.com/tos-alisg-p-0051c001-sg/oomN4IEE8hmXqhQPDfj0GrgEDfAvFBCL4B8qRI~tplv-noop.image?refresh_token=b0939911&VideoID=v10033g50000d8ghht7og65s9nvjgbj0"
    assert.notEqual(previewSourceHash(a), previewSourceHash(b))
  })

  it("returns null for a value that is not an http(s) URL", () => {
    assert.equal(previewSourceHash("not a url"), null)
    assert.equal(previewSourceHash("ftp://scontent.xx.fbcdn.net/a.jpg"), null)
  })
})
