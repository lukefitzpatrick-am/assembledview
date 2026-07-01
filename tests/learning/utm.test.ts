import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUtmUrl, normaliseValue, missingRequired, looksLikeUrl } from "../../src/lib/learning/utm";

const OFF = { lowercase: false, dashes: false };
const ON = { lowercase: true, dashes: true };

test("builds a basic tagged url", () => {
  const out = buildUtmUrl("https://example.com/page", { source: "google", medium: "cpc", campaign: "spring" }, OFF);
  assert.equal(out, "https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=spring");
});

test("appends with & when the base already has a query", () => {
  const out = buildUtmUrl("https://example.com/p?ref=nav", { source: "meta" }, OFF);
  assert.equal(out, "https://example.com/p?ref=nav&utm_source=meta");
});

test("keeps the #fragment at the very end", () => {
  const out = buildUtmUrl("https://example.com/p#section", { source: "meta", medium: "paid-social" }, OFF);
  assert.equal(out, "https://example.com/p?utm_source=meta&utm_medium=paid-social#section");
});

test("encodes spaces as %20 and special chars", () => {
  const out = buildUtmUrl("https://example.com", { campaign: "spring sale & more" }, OFF);
  assert.equal(out, "https://example.com?utm_campaign=spring%20sale%20%26%20more");
});

test("lowercase + dashes helpers normalise before encoding", () => {
  const out = buildUtmUrl("https://example.com", { campaign: "Spring Sale" }, ON);
  assert.equal(out, "https://example.com?utm_campaign=spring-sale");
});

test("omits empty params and preserves canonical order", () => {
  const out = buildUtmUrl("https://x.io", { content: "banner", source: "google" }, OFF);
  assert.equal(out, "https://x.io?utm_source=google&utm_content=banner");
});

test("returns the base unchanged when no params are set", () => {
  assert.equal(buildUtmUrl("https://x.io/", {}, OFF), "https://x.io/");
});

test("normaliseValue trims, lowercases and hyphenates", () => {
  assert.equal(normaliseValue("  Email Blast  ", ON), "email-blast");
  assert.equal(normaliseValue("  Email Blast  ", OFF), "Email Blast");
});

test("missingRequired flags the empty core params", () => {
  assert.deepEqual(missingRequired({ source: "google" }), ["utm_medium", "utm_campaign"]);
  assert.deepEqual(missingRequired({ source: "g", medium: "cpc", campaign: "s" }), []);
});

test("looksLikeUrl accepts http(s) only", () => {
  assert.equal(looksLikeUrl("https://x.io"), true);
  assert.equal(looksLikeUrl("example.com"), false);
});
