const fs = require("fs");
const path = "components/media-containers/DigitalAudioContainer.tsx";
let s = fs.readFileSync(path, "utf8");

if (!s.includes('from "@/components/media-containers/ExpertCard"')) {
  s = s.replace(
    'import { Badge } from "@/components/ui/badge"\n',
    'import { Badge } from "@/components/ui/badge"\nimport { ExpertCard } from "@/components/media-containers/ExpertCard"\nimport { DIGIAUDIO_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"\n'
  );
}

if (!s.includes("formatBuyTypeForDisplay")) {
  s = s.replace(
    `  const getDeliverablesLabel = useCallback((buyType: string) => {
    if (!buyType) return "Deliverables";
    
    switch (buyType.toLowerCase()) {
      case "cpc":
        return "Clicks";
      case "cpv":
        return "Views";
      case "cpm":
        return "Impressions";
      case "fixed_cost":
        return "Fixed Fee";
      default:
        return "Deliverables";
    }
  }, []);
  
  // Effect hooks`,
    `  const getDeliverablesLabel = useCallback((buyType: string) => {
    if (!buyType) return "Deliverables";
    
    switch (buyType.toLowerCase()) {
      case "cpc":
        return "Clicks";
      case "cpv":
        return "Views";
      case "cpm":
        return "Impressions";
      case "fixed_cost":
        return "Fixed Fee";
      default:
        return "Deliverables";
    }
  }, []);

  const formatBuyTypeForDisplay = useCallback((buyType: string) => {
    if (!buyType) return "Not selected";

    switch (buyType.toLowerCase()) {
      case "cpt":
        return "CPT";
      case "cpm":
        return "CPM";
      case "cpv":
        return "CPV";
      case "cpc":
        return "CPC";
      case "spots":
        return "Spots";
      case "package":
        return "Package";
      case "bonus":
        return "Bonus";
      case "package_inclusions":
        return "Package Inclusions";
      case "fixed_cost":
        return "Fixed Cost";
      case "guaranteed_leads":
        return "Guaranteed Leads";
      case "insertions":
        return "Insertions";
      case "panels":
        return "Panels";
      case "screens":
        return "Screens";
      default:
        return buyType;
    }
  }, []);
  
  // Effect hooks`
  );
}

s = s.replace(
  "const selectedPublisher = form.watch(`digiaudiolineItems.${lineItemIndex}.publisher`);",
  `const selectedPublisher =
                    form.watch(\`digiaudiolineItems.\${lineItemIndex}.publisher\`) ||
                    form.watch(\`digiaudiolineItems.\${lineItemIndex}.platform\`);`
);

const startMarker = "return (\n                    <Card key={field.id}";
const endMarker = "</Card>\n                  );";
const start = s.indexOf(startMarker);
if (start < 0) {
  console.error("START NOT FOUND");
  process.exit(1);
}
const end = s.indexOf(endMarker, start);
if (end < 0) {
  console.error("END NOT FOUND");
  process.exit(1);
}
const endExclusive = end + endMarker.length;

const replacement = `return (
                    <ExpertCard<DigiAudioFormValues>
                      key={field.id}
                      config={DIGIAUDIO_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="digiaudiolineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(\`digiaudiolineItems.\${lineItemIndex}.budgetIncludesFees\`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feedigiaudio || 0))) * (feedigiaudio || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      dynamicOptionsByKey={{
                        site: filteredDigiAudioSites.map((site) => ({
                          value: site.site || \`site-\${site.id}\`,
                          label: site.site || "(Unnamed site)",
                        })),
                      }}
                      feePct={feedigiaudio || 0}
                      calculatedVariant="cpcCpvCpm"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(\`digiaudiolineItems.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
                        if (key === "publisher") {
                          form.setValue(\`digiaudiolineItems.\${li}.platform\`, value, {
                            shouldDirty: true,
                          });
                          form.setValue(\`digiaudiolineItems.\${li}.site\`, "", {
                            shouldDirty: true,
                          });
                        }
                      }}
                      fieldAdornments={{
                        site: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              const currentPublisherInForm =
                                form.getValues(\`digiaudiolineItems.\${lineItemIndex}.publisher\`) ||
                                form.getValues(\`digiaudiolineItems.\${lineItemIndex}.platform\`);
                              if (!currentPublisherInForm) {
                                toast({
                                  title: "Select a Publisher First",
                                  description: "Please select a Publisher before adding a site.",
                                  variant: "default",
                                });
                                return;
                              }
                              setCurrentLineItemIndexForNewSite(lineItemIndex);
                              setNewSiteName("");
                              setNewSitePlatform(selectedPublisher);
                              setIsAddSiteDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                      }}
                      comboboxPropsByKey={{
                        site: {
                          disabled: !selectedPublisher,
                          placeholder: selectedPublisher
                            ? "Select Site"
                            : "Select Publisher first",
                          searchPlaceholder: "Search sites...",
                          emptyText: selectedPublisher
                            ? \`No sites found for "\${selectedPublisher}".\`
                            : "Select Publisher first",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Publisher:</span>{" "}
                              {form.watch(\`digiaudiolineItems.\${lineItemIndex}.platform\`) ||
                                form.watch(\`digiaudiolineItems.\${lineItemIndex}.publisher\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(\`digiaudiolineItems.\${lineItemIndex}.buyType\`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Site:</span>{" "}
                              {form.watch(\`digiaudiolineItems.\${lineItemIndex}.site\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(\`digiaudiolineItems.\${lineItemIndex}.bursts\`, []).length}
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
                            onClick={() => removeLineItem(lineItemIndex)}
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
                            {lineItemIndex === lineItemFields.length - 1 && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  appendLineItem({
                                    platform: "",
                                    site: "",
                                    bidStrategy: "",
                                    buyType: "",
                                    publisher: "",
                                    targetingAttribute: "",
                                    creativeTargeting: "",
                                    creative: "",
                                    buyingDemo: "",
                                    market: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    ...(() => {
                                      const nextNumber = lineItemFields.length + 1;
                                      const id = buildLineItemId(
                                        mbaNumber,
                                        MEDIA_TYPE_ID_CODES.digitalAudio,
                                        nextNumber
                                      );
                                      return {
                                        lineItemId: id,
                                        line_item_id: id,
                                        line_item: nextNumber,
                                        lineItem: nextNumber,
                                      };
                                    })(),
                                    bursts: [
                                      {
                                        _reactKey: newBurstReactKey(),
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
                                      } as DigiAudioFormValues["digiaudiolineItems"][number]["bursts"][number] & {
                                        _reactKey: string;
                                      },
                                    ],
                                    totalMedia: 0,
                                    totalDeliverables: 0,
                                    totalFee: 0,
                                  })
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

s = s.slice(0, start) + replacement + s.slice(endExclusive);

if (!s.includes("/>\n                  );\n                })}")) {
  console.error("MAP CLOSE MISSING after ExpertCard");
  process.exit(1);
}

if (s.includes("<Card key={field.id}")) {
  console.error("Still has per-line-item Card");
  process.exit(1);
}

fs.writeFileSync(path, s);
console.log("DigiAudio ExpertCard write OK");
