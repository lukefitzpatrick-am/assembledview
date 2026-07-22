/**
 * Replace Production hand-rolled Card with ExpertCard + burstsSlot.
 * Preserves the map close `})}` after the return.
 */
const fs = require("fs")
const path = require("path")

const file = path.join(
  __dirname,
  "..",
  "components",
  "media-containers",
  "ProductionContainer.tsx"
)
let s = fs.readFileSync(file, "utf8")

const startMarker = `            return (
              <Card key={field.id} className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6">`
const endMarker = `              </Card>
            )`

const start = s.indexOf(startMarker)
if (start < 0) {
  console.error("start marker not found")
  process.exit(1)
}
const end = s.indexOf(endMarker, start)
if (end < 0) {
  console.error("end marker not found")
  process.exit(1)
}

const replacement = `            return (
                    <ExpertCard<ProductionFormValues>
                      key={field.id}
                      config={PRODUCTION_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="lineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatAUD(lineItemMediaTotal)}
                      publishers={[]}
                      dynamicOptionsByKey={{ mediaType: productionTypeComboboxOptions }}
                      feePct={0}
                      calculatedVariant="cpcCpvCpm"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={() => {}}
                      onAppendBurst={handleAddBurst}
                      onDuplicateBurst={(li) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onFieldValueChange={(key, li, value) => {
                        if (key !== "unitRate") return
                        const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ""))
                        const cost = Number.isFinite(parsed) ? parsed : 0
                        const bursts = form.getValues(\`lineItems.\${li}.bursts\`) || []
                        bursts.forEach((_, bi) => {
                          form.setValue(
                            \`lineItems.\${li}.bursts.\${bi}.cost\` as const,
                            cost,
                            { shouldDirty: true }
                          )
                        })
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <span className="font-medium">Production type:</span>{" "}
                              {form.watch(\`lineItems.\${lineItemIndex}.mediaType\`) || "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Publisher:</span>{" "}
                              {form.watch(\`lineItems.\${lineItemIndex}.publisher\`) || "Not provided"}
                            </div>
                            <div>
                              <span className="font-medium">Market:</span>{" "}
                              {form.watch(\`lineItems.\${lineItemIndex}.market\`) || "Not provided"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span> {lineItemBursts.length}
                            </div>
                          </div>
                        </div>
                      }
                      burstsSlot={
                <BurstSection>
                  {lineItemBursts.map((burst, burstIndex) => {
                    const mediaValue = (burst.cost || 0) * (burst.amount || 0)
                    return (
                      <BurstRowCard key={(burst as any)._reactKey ?? \`\${lineItemIndex}-\${burstIndex}\`}>
                        <BurstRowInner>
                          <BurstLabel>
                            {formatBurstLabel(burstIndex + 1, burst.startDate, burst.endDate, {
                              noun: "Production",
                            })}
                          </BurstLabel>

                            <BurstFieldGrid className={MP_BURST_GRID_5}>
                              <FormField
                                control={form.control}
                                name={\`lineItems.\${lineItemIndex}.bursts.\${burstIndex}.cost\`}
                                render={({ field }) => (
                                  <FormItem>
                                    <BurstFieldLabel>Cost</BurstFieldLabel>
                                    <FormControl>
                                      <MoneyInput
                                        ref={field.ref}
                                        name={field.name}
                                        onBlur={field.onBlur}
                                        className="h-10 w-full min-w-0 text-sm"
                                        value={field.value}
                                        onChange={(v) => field.onChange(v ?? 0)}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={\`lineItems.\${lineItemIndex}.bursts.\${burstIndex}.amount\`}
                                render={({ field }) => (
                                  <FormItem>
                                    <BurstFieldLabel>Quantity</BurstFieldLabel>
                                    <FormControl>
                                      <NumericInput
                                        ref={field.ref}
                                        name={field.name}
                                        onBlur={field.onBlur}
                                        decimals={0}
                                        className="h-10 w-full min-w-0 text-sm"
                                        value={field.value}
                                        onChange={(v) => field.onChange(v ?? 0)}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <BurstDateRangeColumn>
                                <FormField
                                  control={form.control}
                                  name={\`lineItems.\${lineItemIndex}.bursts.\${burstIndex}.startDate\`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <BurstFieldLabel>Start Date</BurstFieldLabel>
                                      <FormControl>
                                        <SingleDatePicker
                                          ref={field.ref}
                                          name={field.name}
                                          onBlur={field.onBlur}
                                          value={field.value}
                                          onChange={field.onChange}
                                          className="h-10 w-full pl-2 text-left text-sm font-normal"
                                          calendarContext="media-burst"
                                          mediaBurstRole="start"
                                          campaignStartDate={campaignStartDate}
                                          campaignEndDate={campaignEndDate}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                <FormField
                                  control={form.control}
                                  name={\`lineItems.\${lineItemIndex}.bursts.\${burstIndex}.endDate\`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <BurstFieldLabel>End Date</BurstFieldLabel>
                                      <FormControl>
                                        <SingleDatePicker
                                          ref={field.ref}
                                          name={field.name}
                                          onBlur={field.onBlur}
                                          value={field.value}
                                          onChange={field.onChange}
                                          className="h-10 w-full pl-2 text-left text-sm font-normal"
                                          calendarContext="media-burst"
                                          mediaBurstRole="end"
                                          campaignStartDate={campaignStartDate}
                                          campaignEndDate={campaignEndDate}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </BurstDateRangeColumn>

                              <BurstReadonlyMetric
                                label="Production Total"
                                muted
                                value={formatAUD(mediaValue)}
                              />
                            </BurstFieldGrid>

                            <BurstRowActions
                              onAdd={() => handleAddBurst(lineItemIndex)}
                              onDuplicate={() => handleDuplicateBurst(lineItemIndex)}
                              onRemove={() => handleRemoveBurst(lineItemIndex, burstIndex)}
                            />
                        </BurstRowInner>
                      </BurstRowCard>
                    )
                  })}
                </BurstSection>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => handleAddBurst(lineItemIndex)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Burst
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleDuplicateLineItem(lineItemIndex)}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Duplicate
                    </Button>
                    {lineItemIndex === lineItemFields.length - 1 ? (
                      <Button type="button" size="sm" onClick={handleAddLineItem}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add Line Item
                      </Button>
                    ) : null}
                  </div>
                        </>
                      }
                    />
            )`

s = s.slice(0, start) + replacement + s.slice(end + endMarker.length)
fs.writeFileSync(file, s)
console.log("Production Card → ExpertCard OK")
