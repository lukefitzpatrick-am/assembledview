const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../components/media-containers");

const FILES = [
  "TelevisionContainer.tsx",
  "CinemaContainer.tsx",
  "DigitalAudioContainer.tsx",
  "DigitalDisplayContainer.tsx",
  "MagazinesContainer.tsx",
  "NewspaperContainer.tsx",
  "OOHContainer.tsx",
  "RadioContainer.tsx",
  "SearchContainer.tsx",
  "SocialMediaContainer.tsx",
  "ProgDisplayContainer.tsx",
  "ProgBVODContainer.tsx",
  "ProgOOHContainer.tsx",
  "BVODContainer.tsx",
  "ProgAudioContainer.tsx",
  "DigitalVideoContainer.tsx",
  "ProgVideoContainer.tsx",
  "InfluencersContainer.tsx",
  "IntegrationContainer.tsx",
  "ProductionContainer.tsx",
];

const NEW_CLASS =
  "flex items-center justify-between pt-4 pb-4 bg-muted/20 border-t border-border/40";

const dupRe =
  /^[\s\n]*<Button[\s\S]*?Duplicate Line Item[\s\S]*?<\/Button>[\s\n]*/m;

const removeRe =
  /[\s\n]*<Button type="button" variant="destructive"[\s\S]*?Remove Line Item[\s\S]*?<\/Button>[\s\n]*$/;

function baseIndentBefore(s, idx) {
  const before = s.slice(0, idx);
  const lines = before.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(/^(\s+)/);
    if (line.includes("</div>")) return m ? m[1] : "";
  }
  return "                      ";
}

function transformStandard(s, cardIdx, innerStart, innerEnd, hasFooterId) {
  const inner = s.slice(innerStart, innerEnd);
  const indent = baseIndentBefore(s, cardIdx);

  const hasDup = /Duplicate Line Item/.test(inner);
  let middle = inner;
  if (hasDup) middle = middle.replace(dupRe, "");
  middle = middle.replace(removeRe, "").trim();

  const removeBtn = `${indent}  <Button
${indent}    type="button"
${indent}    variant="ghost"
${indent}    size="sm"
${indent}    className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
${indent}    onClick={() => removeLineItem(lineItemIndex)}
${indent}  >
${indent}    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
${indent}    Remove
${indent}  </Button>`;

  const dupBtn = hasDup
    ? `${indent}    <Button type="button" variant="outline" size="sm" onClick={() => handleDuplicateLineItem(lineItemIndex)}>
${indent}      <Copy className="h-3.5 w-3.5 mr-1.5" />
${indent}      Duplicate
${indent}    </Button>
`
    : "";

  const middleLines = middle
    ? middle.split("\n").map((l) => indent + "    " + l).join("\n") + "\n"
    : "";

  const rightColumn = `${indent}  <div className="flex items-center gap-2">
${dupBtn}${middleLines}${indent}  </div>`;

  const open = hasFooterId
    ? `${indent}<CardFooter id={footerId} className="${NEW_CLASS}">`
    : `${indent}<CardFooter className="${NEW_CLASS}">`;

  return `${open}
${removeBtn}
${rightColumn}
${indent}</CardFooter>`;
}

function transformProduction(s) {
  const marker = `<CardFooter id={footerId} className="flex justify-end flex-wrap gap-2 pt-2">`;
  const idx = s.indexOf(marker);
  if (idx === -1) return s;

  const startInner = idx + marker.length;
  const endIdx = s.indexOf("</CardFooter>", startInner);
  if (endIdx === -1) return s;

  const inner = s.slice(startInner, endIdx);
  const indent = baseIndentBefore(s, idx);

  const addRe =
    /\{lineItemIndex === lineItemFields\.length - 1 && \([\s\S]*?Add Line Item[\s\S]*?\)\}/;
  const dupBtnRe =
    /<Button type="button" variant="outline" onClick=\{\(\) => handleDuplicateLineItem\(lineItemIndex\)\}>[\s\S]*?Duplicate Line Item[\s\S]*?<\/Button>/;
  const removeBtnRe =
    /<Button type="button" variant="destructive" onClick=\{\(\) => removeLineItem\(lineItemIndex\)\}>[\s\S]*?Remove Line Item[\s\S]*?<\/Button>/;

  const addMatch = inner.match(addRe);
  const dupMatch = inner.match(dupBtnRe);
  const removeMatch = inner.match(removeBtnRe);
  if (!dupMatch || !removeMatch) return s;

  let addBlock = addMatch ? addMatch[0].trim() : "";
  if (addBlock) {
    addBlock = addBlock.replace(
      /<Button type="button" onClick=\{handleAddLineItem\}>/,
      `<Button type="button" size="sm" onClick={handleAddLineItem}>`
    );
    addBlock = addBlock.replace(
      /<Plus className="h-4 w-4 mr-2" \/>/,
      `<Plus className="h-3.5 w-3.5 mr-1.5" />`
    );
  }

  const removeBtn = `${indent}  <Button
${indent}    type="button"
${indent}    variant="ghost"
${indent}    size="sm"
${indent}    className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
${indent}    onClick={() => removeLineItem(lineItemIndex)}
${indent}  >
${indent}    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
${indent}    Remove
${indent}  </Button>`;

  const dupBtn = `${indent}    <Button type="button" variant="outline" size="sm" onClick={() => handleDuplicateLineItem(lineItemIndex)}>
${indent}      <Copy className="h-3.5 w-3.5 mr-1.5" />
${indent}      Duplicate
${indent}    </Button>
`;

  const addFormatted = addBlock
    ? addBlock.split("\n").map((l) => indent + "    " + l).join("\n") + "\n"
    : "";

  const rightColumn = `${indent}  <div className="flex items-center gap-2">
${dupBtn}${addFormatted}${indent}  </div>`;

  const open = `${indent}<CardFooter id={footerId} className="${NEW_CLASS}">`;
  const replacement = `${open}
${removeBtn}
${rightColumn}
${indent}</CardFooter>`;
  return s.slice(0, idx) + replacement + s.slice(endIdx + "</CardFooter>".length);
}

/** Normalize CardFooter opening line indent (first line only) */
function fixFooterOpeningLine(s) {
  const key = NEW_CLASS;
  let search = 0;
  let out = s;
  while (true) {
    const i = out.indexOf("<CardFooter", search);
    if (i === -1) break;
    if (!out.slice(i, i + 500).includes(key)) {
      search = i + 1;
      continue;
    }
    const indent = baseIndentBefore(out, i);
    const lineStart = out.lastIndexOf("\n", i - 1) + 1;
    const gt = out.indexOf(">", i);
    const lineEnd = out.indexOf("\n", gt);
    if (lineEnd < 0) break;
    const trimmed = out.slice(lineStart, lineEnd).trim();
    out = out.slice(0, lineStart) + indent + trimmed + out.slice(lineEnd);
    search = lineStart + (indent + trimmed).length + 1;
  }
  return out;
}

/** Add size="sm" + icon size for Add Line Item inside new footers */
function polishFooterInners(s) {
  return s.replace(
    new RegExp(
      `(<CardFooter[^>]*className="${NEW_CLASS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>)([\\s\\S]*?)(</CardFooter>)`,
      "g"
    ),
    (_, open, inner, close) => {
      let inn = inner;
      inn = inn.replace(
        /(<Button\s*\n)(\s*)(type="button")(\s*\n)(?!\s*size="sm")(\s*)(onClick=\{\(\) =>[\s\S]*?appendLineItem)/g,
        "$1$2$3\n$5size=\"sm\"\n$5$6"
      );
      inn = inn.replace(
        /(<Plus className=")h-4 w-4 mr-2(" \/>)/g,
        "$1h-3.5 w-3.5 mr-1.5$2"
      );
      return open + inn + close;
    }
  );
}

function processFile(filePath) {
  let s = fs.readFileSync(filePath, "utf8");
  const base = path.basename(filePath);

  if (base === "ProductionContainer.tsx") {
    if (s.includes(`className="flex justify-end flex-wrap gap-2 pt-2"`)) {
      s = transformProduction(s);
    }
  } else {
    const markers = [
      `<CardFooter id={footerId} className="flex justify-end space-x-2 pt-2">`,
      `<CardFooter className="flex justify-end space-x-2 pt-2">`,
    ];
    for (const marker of markers) {
      const idx = s.indexOf(marker);
      if (idx === -1) continue;
      const hasFooterId = marker.includes("footerId");
      const innerStart = idx + marker.length;
      const endIdx = s.indexOf("</CardFooter>", innerStart);
      if (endIdx === -1) continue;
      const inner = s.slice(innerStart, endIdx);
      if (!inner.includes("Remove Line Item")) continue;
      const replacement = transformStandard(s, idx, innerStart, endIdx, hasFooterId);
      s = s.slice(0, idx) + replacement + s.slice(endIdx + "</CardFooter>".length);
      break;
    }
  }

  s = fixFooterOpeningLine(s);
  s = polishFooterInners(s);
  fs.writeFileSync(filePath, s);
}

for (const name of FILES) {
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) {
    console.warn("missing", name);
    continue;
  }
  processFile(p);
  console.log("processed", name);
}
