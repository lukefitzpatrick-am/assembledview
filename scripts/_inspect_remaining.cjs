const fs = require("fs");
const files = [
  "ProgDisplayContainer",
  "ProgBVODContainer",
  "ProgAudioContainer",
  "DigitalDisplayContainer",
  "BVODContainer",
  "DigitalAudioContainer",
];
for (const f of files) {
  const p = `components/media-containers/${f}.tsx`;
  const s = fs.readFileSync(p, "utf8");
  const hasExpert = s.includes("ExpertCard");
  const cardIdx = s.indexOf("<Card key={field.id}");
  const itemsKeys = [...s.matchAll(/name:\s*"([^"]+)"/g)]
    .map((x) => x[1])
    .filter((n) => /lineItems|Items/i.test(n));
  const fee = (s.match(/fee\w+:\s*number/) || [])[0];
  const formType = (s.match(/type (\w+FormValues)/) || [])[1];
  const before = cardIdx > 0 ? s.slice(Math.max(0, cardIdx - 40), cardIdx) : "";
  // extract appendLineItem payload keys from first append
  const appendM = s.match(/appendLineItem\(\{([\s\S]*?)\}\)/);
  const appendKeys = appendM
    ? [...appendM[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
    : [];
  console.log(
    JSON.stringify({
      f,
      hasExpert,
      cardIdx,
      itemsKeys: [...new Set(itemsKeys)].slice(0, 5),
      fee,
      formType,
      appendKeys,
      beforeCard: JSON.stringify(before),
    })
  );
}
