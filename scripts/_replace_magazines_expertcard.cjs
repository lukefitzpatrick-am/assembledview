const fs = require("fs");
const path =
  "c:/Projects/avmediaplan/.worktrees/refactor-expertgrid-consolidation/components/media-containers/MagazinesContainer.tsx";
const src = fs.readFileSync(path, "utf8");
const startMarker = "                  return (\n                    <Card key={field.id}";
const endMarker = "                    </Card>\n                  );";
const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  console.error("markers missing", { start, end });
  process.exit(1);
}

const replacement = `                  return (
                    <ExpertCard<MagazinesFormValues>
                      key={field.id}
                      config={MAGAZINES_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="magazineslineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(\`magazineslineItems.\${lineItemIndex}.budgetIncludesFees\`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feemagazines || 0))) * (feemagazines || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      dynamicOptionsByKey={{
                        title: filteredMagazines.map((m) => ({
                          value: m.title || \`title-\${m.id}\`,
                          label: m.title || "(Untitled)",
                        })),
                        size: magazinesAdSizes.map((s) => ({
                          value: s,
                          label: s,
                        })),
                      }}
                      feePct={feemagazines || 0}
                      calculatedVariant="magazine"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li, _bi) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(\`magazineslineItems.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
                      }}
                      fieldAdornments={{
                        title: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              const currentNetworkInForm = form.getValues(
                                \`magazineslineItems.\${lineItemIndex}.network\`
                              );
                              if (!currentNetworkInForm) {
                                toast({
                                  title: "Select a Network First",
                                  description: "Please select a network before adding a title.",
                                  variant: "default",
                                });
                                return;
                              }
                              setCurrentLineItemIndexForNewTitle(lineItemIndex);
                              setNewTitleName("");
                              setNewTitleNetwork(currentNetworkInForm);
                              setIsAddTitleDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                        size: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              setCurrentLineItemIndexForNewAdSize(lineItemIndex);
                              setNewAdSizeName("");
                              setIsAddAdSizeDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                      }}
                      comboboxPropsByKey={{
                        title: {
                          disabled: !selectedNetwork,
                          placeholder: selectedNetwork
                            ? "Select Title"
                            : "Select Network first",
                          searchPlaceholder: "Search titles...",
                          emptyText: selectedNetwork
                            ? \`No titles found for "\${selectedNetwork}".\`
                            : "Select Network first",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                        size: {
                          placeholder: "Select Ad Size",
                          searchPlaceholder: "Search ad sizes...",
                          emptyText: "No ad sizes found.",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Network:</span>{" "}
                              {form.watch(\`magazineslineItems.\${lineItemIndex}.network\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(\`magazineslineItems.\${lineItemIndex}.buyType\`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Title:</span>{" "}
                              {form.watch(\`magazineslineItems.\${lineItemIndex}.title\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(\`magazineslineItems.\${lineItemIndex}.bursts\`, []).length}
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
                                    network: "",
                                    title: "",
                                    buyType: "",
                                    size: "",
                                    publisher: "",
                                    placement: "",
                                    buyingDemo: "",
                                    market: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    ...(() => {
                                      const nextNumber = lineItemFields.length + 1;
                                      const id = createLineItemId(nextNumber);
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

const out = src.slice(0, start) + replacement + src.slice(end + endMarker.length);
fs.writeFileSync(path, out);
console.log("replaced ok");
const after = out.indexOf(
  '/>\n                  );\n                })}\n              </div>',
  out.indexOf("MAGAZINES_EXPERT_CHANNEL_CONFIG")
);
console.log("map close intact", after > 0);
