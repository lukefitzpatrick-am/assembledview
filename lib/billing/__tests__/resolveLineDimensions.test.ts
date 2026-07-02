import assert from "node:assert/strict"
import test from "node:test"

import { resolveLineDimensions } from "../../finance/resolveLineDimensions.js"

test("resolveLineDimensions applies the locked per-channel report dimensions", () => {
  const cases = [
    {
      mediaType: "television",
      source: {
        network: " Nine ",
        buyType: " CPM ",
        daypart: "",
        placement: "Prime",
        station: "TCN",
      },
      expected: {
        mediaType: "Television",
        publisher: "Nine",
        buyType: "CPM",
        format: "Prime",
        station: "TCN",
      },
    },
    {
      mediaType: "radio",
      source: { network: "", station: "3AW", buyType: "Spots", placement: "Breakfast" },
      expected: {
        mediaType: "Radio",
        publisher: "3AW",
        buyType: "Spots",
        station: "3AW",
      },
    },
    {
      mediaType: "newspaper",
      source: { publisher: "", network: "News Corp", buyType: "Insertion", size: "", ad_size: "Half Page" },
      expected: {
        mediaType: "Newspaper",
        publisher: "News Corp",
        buyType: "Insertion",
        format: "Half Page",
      },
    },
    {
      mediaType: "magazines",
      source: { publisher: "Bauer", network: "Fallback", buyType: "Package", size: "DPS" },
      expected: {
        mediaType: "Magazines",
        publisher: "Bauer",
        buyType: "Package",
        format: "DPS",
      },
    },
    {
      mediaType: "ooh",
      source: { network: "JCDecaux", buyType: "Rental", format: "", type: "Street Furniture" },
      expected: {
        mediaType: "OOH",
        publisher: "JCDecaux",
        buyType: "Rental",
        format: "Street Furniture",
      },
    },
    {
      mediaType: "cinema",
      source: { network: "Val Morgan", buyType: "CPM", format: "", duration: "30s", station: "Hoyts" },
      expected: {
        mediaType: "Cinema",
        publisher: "Val Morgan",
        buyType: "CPM",
        format: "30s",
        station: "Hoyts",
      },
    },
    {
      mediaType: "digiDisplay",
      source: { publisher: "", platform: "Google Display", site: "example.com", buyType: "CPM", placement: "", size: "300x250" },
      expected: {
        mediaType: "Digital Display",
        publisher: "Google Display",
        buyType: "CPM",
        format: "300x250",
      },
    },
    {
      mediaType: "digiVideo",
      source: { publisher: "YouTube", platform: "Google", site: "youtube.com", buyType: "CPV", placement: "Pre-roll" },
      expected: {
        mediaType: "Digital Video",
        publisher: "YouTube",
        buyType: "CPV",
        format: "Pre-roll",
      },
    },
    {
      mediaType: "digiAudio",
      source: { publisher: "", platform: "Spotify", buyType: "CPM", placement: "Podcast" },
      expected: {
        mediaType: "Digital Audio",
        publisher: "Spotify",
        buyType: "CPM",
        format: "Podcast",
      },
    },
    {
      mediaType: "bvod",
      source: { publisher: "", platform: "9Now", buyType: "CPM", placement: "Catch-up" },
      expected: {
        mediaType: "BVOD",
        publisher: "9Now",
        buyType: "CPM",
        format: "Catch-up",
      },
    },
    {
      mediaType: "search",
      source: { platform: "Google Ads", buyType: "CPC", placement: "Brand" },
      expected: {
        mediaType: "Search",
        publisher: "Google Ads",
        buyType: "CPC",
      },
    },
    {
      mediaType: "socialMedia",
      source: { platform: "Meta", buyType: "CPM", placement: "Feed" },
      expected: {
        mediaType: "Social",
        publisher: "Meta",
        buyType: "CPM",
      },
    },
    {
      mediaType: "progDisplay",
      source: { platform: "", site: "DV360 Site", buyType: "CPM", placement: "", size: "Leaderboard" },
      expected: {
        mediaType: "Programmatic Display",
        publisher: "DV360 Site",
        buyType: "CPM",
        format: "Leaderboard",
      },
    },
    {
      mediaType: "progVideo",
      source: { platform: "DV360", site: "Video Site", buyType: "CPV", placement: "In-stream" },
      expected: {
        mediaType: "Programmatic Video",
        publisher: "DV360",
        buyType: "CPV",
        format: "In-stream",
      },
    },
    {
      mediaType: "progBvod",
      source: { platform: "The Trade Desk", site: "BVOD Site", buyType: "CPM", placement: "BVOD", size: "16:9" },
      expected: {
        mediaType: "Programmatic BVOD",
        publisher: "The Trade Desk",
        buyType: "CPM",
        format: "BVOD",
      },
    },
    {
      mediaType: "progAudio",
      source: { platform: "DV360 Audio", site: "Audio Site", buyType: "CPM", placement: "Streaming" },
      expected: {
        mediaType: "Programmatic Audio",
        publisher: "DV360 Audio",
        buyType: "CPM",
        format: "Streaming",
      },
    },
    {
      mediaType: "progOoh",
      source: { platform: "", site: "Vistar", buyType: "CPM", placement: "", size: "Panel" },
      expected: {
        mediaType: "Programmatic OOH",
        publisher: "Vistar",
        buyType: "CPM",
        format: "Panel",
      },
    },
    {
      mediaType: "integration",
      source: { platform: "Podcast Network", buyType: "Package", objective: "", campaign: "Launch" },
      expected: {
        mediaType: "Integration",
        publisher: "Podcast Network",
        buyType: "Package",
        format: "Launch",
      },
    },
    {
      mediaType: "influencers",
      source: { platform: "TikTok", buyType: "Package", objective: "Awareness", campaign: "Summer" },
      expected: {
        mediaType: "Influencers",
        publisher: "TikTok",
        buyType: "Package",
        format: "Awareness",
      },
    },
    {
      mediaType: "production",
      source: {
        publisher: "Print Studio",
        description: "Catalogue shoot",
        media_type: "Print",
      },
      expected: {
        mediaType: "Production",
        publisher: "Print Studio",
        buyType: "production",
        format: "Catalogue shoot",
      },
    },
  ]

  for (const c of cases) {
    assert.deepEqual(resolveLineDimensions(c.mediaType, c.source), c.expected)
  }
})

test("resolveLineDimensions omits empty optional axes", () => {
  assert.deepEqual(resolveLineDimensions("search", { platform: "Google", buyType: "" }), {
    mediaType: "Search",
    publisher: "Google",
  })
  assert.equal(Object.hasOwn(resolveLineDimensions("radio", { station: "2GB" }), "format"), false)
  assert.equal(Object.hasOwn(resolveLineDimensions("socialMedia", { platform: "Meta" }), "format"), false)
})
