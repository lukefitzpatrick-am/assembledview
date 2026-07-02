import assert from "node:assert/strict"
import test from "node:test"

const ENV_SKIP = !process.env.XANO_PUBLISHERS_BASE_URL
  ? "Missing XANO_PUBLISHERS_BASE_URL (integration test requires Xano env)"
  : false

test("bonus buy type burst helpers", { skip: ENV_SKIP }, async () => {
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
                  budget: "0",
                  buyAmount: "0",
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
                  budget: "0",
                  buyAmount: "0",
                  calculatedValue: 8,
                  startDate: today,
                  endDate: today,
                },
              ],
            },
          ]
        : [],
  } as any

  const tvBursts = getTelevisionBursts(tvForm, 0)
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
                  budget: "0",
                  buyAmount: "0",
                  tarps: "5",
                  startDate: today,
                  endDate: today,
                },
              ],
            },
          ]
        : [],
  } as any

  const socialBursts = getSocialMediaBursts(socialForm, 0)
  assert.equal(socialBursts[0].mediaAmount, 0, "Social bonus should keep media at 0")
  assert.equal(socialBursts[0].feeAmount, 0, "Social bonus should keep fee at 0")
  assert.equal(
    socialBursts[0].deliverables,
    8,
    "Social bonus keeps editable deliverables",
  )
  assert.equal(socialBursts[0].buyType, "bonus")

  const tvPackageBursts = getTelevisionBursts(tvPackageForm, 0)
  assert.equal(tvPackageBursts[0].mediaAmount, 0, "TV package inclusions should keep media at 0")
  assert.equal(tvPackageBursts[0].feeAmount, 0, "TV package inclusions should keep fee at 0")
  assert.equal(
    tvPackageBursts[0].deliverables,
    5,
    "TV package inclusions keeps editable deliverables",
  )
  assert.equal(tvPackageBursts[0].buyType, "package_inclusions")
})
