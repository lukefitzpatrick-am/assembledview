/**
 * Replace Card → ExpertCard for social-like programmatic channels.
 * Usage: node scripts/_replace_sociallike_expertcard.cjs <channel>
 * Channels: progbvod | progaudio | digidisplay | bvod | digiaudio
 */
const fs = require("fs");
const path = require("path");

const CHANNELS = {
  progbvod: {
    file: "ProgBVODContainer.tsx",
    formType: "ProgBvodFormValues",
    config: "PROGBVOD_EXPERT_CHANNEL_CONFIG",
    fee: "feeprogbvod",
    itemsKey: "lineItems",
    importConfig: true,
    appendObject: `appendLineItem({
                                    platform: "",
                                    bidStrategy: "",
                                    buyType: "",
                                    creativeTargeting: "",
                                    creative: "",
                                    buyingDemo: "",
                                    market: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    bursts: [
                                      {
                                        budget: "",
                                        buyAmount: "",
                                        startDate: defaultMediaBurstStartDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        endDate: defaultMediaBurstEndDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        calculatedValue: 0,
                                        fee: 0,
                                        _reactKey: newBurstReactKey(),
                                      } as any,
                                    ],
                                  })`,
  },
  progaudio: {
    file: "ProgAudioContainer.tsx",
    formType: "ProgAudioFormValues",
    config: "PROGAUDIO_EXPERT_CHANNEL_CONFIG",
    fee: "feeprogaudio",
    itemsKey: "lineItems",
    importConfig: true,
    appendObject: `appendLineItem({
                                    platform: "",
                                    bidStrategy: "",
                                    buyType: "",
                                    site: "",
                                    placement: "",
                                    targetingAttribute: "",
                                    creativeTargeting: "",
                                    creative: "",
                                    buyingDemo: "",
                                    market: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    bursts: [
                                      {
                                        budget: "",
                                        buyAmount: "",
                                        startDate: defaultMediaBurstStartDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        endDate: defaultMediaBurstEndDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        calculatedValue: 0,
                                        fee: 0,
                                        _reactKey: newBurstReactKey(),
                                      } as any,
                                    ],
                                  })`,
  },
  digidisplay: {
    file: "DigitalDisplayContainer.tsx",
    formType: "DigiDisplayFormValues",
    config: "DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG",
    fee: "feedigidisplay",
    itemsKey: "digidisplaylineItems",
    importConfig: true,
    fieldsVar: "digidisplaylineItemFields",
    appendFn: "appendDigidisplayLineItem",
    removeFn: "removeDigidisplayLineItem",
    appendObject: null, // filled after reading file
  },
  bvod: {
    file: "BVODContainer.tsx",
    formType: "BVODFormValues",
    config: "BVOD_EXPERT_CHANNEL_CONFIG",
    fee: "feebvod",
    itemsKey: "bvodlineItems",
    importConfig: true,
    fieldsVar: "bvodlineItemFields",
    appendFn: "appendBvodLineItem",
    removeFn: "removeBvodLineItem",
    appendObject: null,
  },
  digiaudio: {
    file: "DigitalAudioContainer.tsx",
    formType: "DigiAudioFormValues",
    config: "DIGIAUDIO_EXPERT_CHANNEL_CONFIG",
    fee: "feedigiaudio",
    itemsKey: "digiaudiolineItems",
    importConfig: true,
    fieldsVar: "digiaudiolineItemFields",
    appendFn: "appendDigiaudioLineItem",
    removeFn: "removeDigiaudioLineItem",
    appendObject: null,
  },
};

const channelKey = process.argv[2];
if (!channelKey || !CHANNELS[channelKey]) {
  console.error("Usage: node scripts/_replace_sociallike_expertcard.cjs <" + Object.keys(CHANNELS).join("|") + ">");
  process.exit(1);
}

const cfg = CHANNELS[channelKey];
const filePath = path.join(__dirname, "..", "components", "media-containers", cfg.file);
let src = fs.readFileSync(filePath, "utf8");

if (src.includes(`<ExpertCard<${cfg.formType}>`)) {
  console.log(cfg.file, "already has ExpertCard");
  process.exit(0);
}

const itemsKey = cfg.itemsKey;
const fee = cfg.fee;
const fieldsVar = cfg.fieldsVar || "lineItemFields";
const appendFn = cfg.appendFn || "appendLineItem";
const removeFn = cfg.removeFn || "removeLineItem";

// Extract append payload from existing footer Add Line Item if not provided
let appendObject = cfg.appendObject;
if (!appendObject) {
  const appendMatch = src.match(new RegExp(`${appendFn}\\(\\{[\\s\\S]*?\\}\\)\\s*\\}\\s*\\n`));
  if (!appendMatch) {
    // try appendLineItem
    const m2 = src.match(/append\w*\(\{[\s\S]*?\}\)\s*\}\s*\n\s*>/);
    if (!m2) {
      console.error("Could not find append object in", cfg.file);
      process.exit(1);
    }
    appendObject = m2[0].replace(/\s*\}\s*\n\s*>$/, "").trim();
  } else {
    appendObject = appendMatch[0].replace(/\s*\}\s*\n$/, "").trim();
  }
}

const startMarker = `return (\n                    <Card key={field.id}`;
const start = src.indexOf(startMarker);
if (start < 0) {
  console.error("start marker not found in", cfg.file);
  process.exit(1);
}
const endMarker = `</Card>\n                  );`;
const end = src.indexOf(endMarker, start);
if (end < 0) {
  console.error("end marker not found in", cfg.file);
  process.exit(1);
}

const replacement = `return (
                    <ExpertCard<${cfg.formType}>
                      key={field.id}
                      config={${cfg.config}}
                      form={form}
                      itemsKey="${itemsKey}"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(\`${itemsKey}.\${lineItemIndex}.budgetIncludesFees\`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (${fee} || 0))) * (${fee} || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      feePct={${fee} || 0}
                      calculatedVariant="cpcCpvCpm"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li, _bi) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(\`${itemsKey}.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Platform:</span>{" "}
                              {form.watch(\`${itemsKey}.\${lineItemIndex}.platform\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {form.watch(\`${itemsKey}.\${lineItemIndex}.buyType\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bid strategy:</span>{" "}
                              {form.watch(\`${itemsKey}.\${lineItemIndex}.bidStrategy\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(\`${itemsKey}.\${lineItemIndex}.bursts\`, []).length}
                            </div>
                          </div>
                        </div>
                      }
                      footer={
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => ${removeFn}(lineItemIndex)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Remove
                          </Button>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleDuplicateLineItem(lineItemIndex)}
                            >
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              Duplicate
                            </Button>
                            {lineItemIndex === ${fieldsVar}.length - 1 && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  ${appendObject}
                                }
                              >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Add Line Item
                              </Button>
                            )}
                          </div>
                        </>
                      }
                    />
                  );`;

let next = src.slice(0, start) + replacement + src.slice(end + endMarker.length);

// Fix imports
if (!next.includes('import { ExpertCard }')) {
  next = next.replace(
    /import \{ Card, CardContent, CardHeader, CardTitle, CardFooter \} from "@\/components\/ui\/card"/,
    'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"\nimport { ExpertCard } from "@/components/media-containers/ExpertCard"'
  );
  // some files may not use CardFooter
  if (!next.includes('import { ExpertCard }')) {
    next = next.replace(
      /import \{ Card, CardContent, CardHeader, CardTitle \} from "@\/components\/ui\/card"/,
      'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"\nimport { ExpertCard } from "@/components/media-containers/ExpertCard"'
    );
  }
}

if (cfg.importConfig && !next.includes(cfg.config)) {
  // Add config import near other expert imports or after schemas
  if (next.includes('from "@/lib/mediaplan/expertGridChannelConfig"')) {
    next = next.replace(
      /from "@\/lib\/mediaplan\/expertGridChannelConfig"/,
      (m) => m // already has some import - need to add to named imports
    );
    // Try to extend existing import
    const re = /import \{([^}]+)\} from "@\/lib\/mediaplan\/expertGridChannelConfig"/;
    const im = next.match(re);
    if (im && !im[1].includes(cfg.config)) {
      next = next.replace(re, `import {${im[1].trim().replace(/,$/, "")},\n  ${cfg.config},\n} from "@/lib/mediaplan/expertGridChannelConfig"`);
    }
  } else {
    next = next.replace(
      'import { ExpertCard } from "@/components/media-containers/ExpertCard"',
      `import { ExpertCard } from "@/components/media-containers/ExpertCard"\nimport { ${cfg.config} } from "@/lib/mediaplan/expertGridChannelConfig"`
    );
  }
}

fs.writeFileSync(filePath, next);
const after = next.slice(start + replacement.length, start + replacement.length + 30);
console.log(cfg.file, "ExpertCard replace ok", {
  hasMapClose: after.includes("})") || next.slice(start + replacement.length - 5, start + replacement.length + 20).includes("})"),
  afterSnippet: JSON.stringify(after),
  hasExpert: next.includes(`<ExpertCard<${cfg.formType}>`),
});
