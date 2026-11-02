import assert from "node:assert/strict"
import test from "node:test"

// B6: no Xano env needed (the container burst helpers read none); this test
// used to skip whenever XANO_PUBLISHERS_BASE_URL was unset, i.e. always.
// B7 (L-2): a non-zero budget and fee, so "media 0 / fee 0" can fail; the paid
// control below proves the same inputs give non-zero amounts.
const FEE_PCT = 15

test("bonus buy type burst helpers", async () => {
  const { getTelevisionBursts } = await import(
    "../../components/media-containers/TelevisionContainer"
  )
  const { getSocialMediaBursts } = await import(
    "../../components/media-containers/SocialMediaContainer"
  )

  const today = new Date()

  const tvForm = {
    getValues: (field: string) =>
      field === "televisionlineItems"
        ? [
            {
              buyType: "bonus",
              budgetIncludesFees: false,
              clientPaysForMedia: false,
              bursts: [
                {
                  budget: "1000",
                  buyAmount: "10",
                  tarps: "12",
                  startDate: today,
                  endDate: today,
                },
              ],
            },
          ]
        : [],
  } as any

  const socialForm = {
    getValues: (field: string) =>
      field === "lineItems"
        ? [
            {
              buyType: "bonus",
              budgetIncludesFees: false,
              clientPaysForMedia: false,
              bursts: [
                {
                  budget: "1000",
                  buyAmount: "10",
                  calculatedValue: 8,
                  startDate: today,
                  endDate: today,
                },
              ],
            },
          ]
        : [],
  } as any

  const tvBursts = getTelevisionBursts(tvForm, FEE_PCT)
  assert.equal(tvBursts[0].mediaAmount, 0, "TV bonus should keep media at 0")
  assert.equal(tvBursts[0].feeAmount, 0, "TV bonus should keep fee at 0")
  assert.equal(tvBursts[0].deliverables, 12, "TV bonus keeps editable deliverables")
  assert.equal(tvBursts[0].buyType, "bonus")

  const tvPackageForm = {
    getValues: (field: string) =>
      field === "televisionlineItems"
        ? [
            {
              buyType: "package_inclusions",
              budgetIncludesFees: false,
              clientPaysForMedia: false,
              bursts: [
                {
                  budget: "1000",
                  buyAmount: "10",
                  tarps: "5",
                  startDate: today,
                  endDate: today,
                },
              ],
            },
          ]
        : [],
  } as any

  const socialBursts = getSocialMediaBursts(socialForm, FEE_PCT)
  assert.equal(socialBursts[0].mediaAmount, 0, "Social bonus should keep media at 0")
  assert.equal(socialBursts[0].feeAmount, 0, "Social bonus should keep fee at 0")
  assert.equal(
    socialBursts[0].deliverables,
    8,
    "Social bonus keeps editable deliverables",
  )
  assert.equal(socialBursts[0].buyType, "bonus")

  const tvPackageBursts = getTelevisionBursts(tvPackageForm, FEE_PCT)
  assert.equal(tvPackageBursts[0].mediaAmount, 0, "TV package inclusions should keep media at 0")
  assert.equal(tvPackageBursts[0].feeAmount, 0, "TV package inclusions should keep fee at 0")
  assert.equal(
    tvPackageBursts[0].deliverables,
    5,
    "TV package inclusions keeps editable deliverables",
  )
  assert.equal(tvPackageBursts[0].buyType, "package_inclusions")

  // Paid control: same budget and fee, buy type that is not bonus.
  const asPaid = (form: any, key: string, buyType: string) =>
    ({
      getValues: (field: string) =>
        field === key ? form.getValues(field).map((li: any) => ({ ...li, buyType })) : [],
    }) as any
  const tvPaid = getTelevisionBursts(asPaid(tvForm, "televisionlineItems", "cpt"), FEE_PCT)
  const socialPaid = getSocialMediaBursts(asPaid(socialForm, "lineItems", "cpm"), FEE_PCT)
  for (const [label, b] of [["TV paid", tvPaid[0]], ["Social paid", socialPaid[0]]] as const) {
    assert.ok(b.mediaAmount > 0, `${label} control has media`)
    assert.ok(b.feeAmount > 0, `${label} control has a fee`)
  }
})
