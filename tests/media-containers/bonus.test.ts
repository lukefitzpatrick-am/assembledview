import assert from "node:assert/strict"
import { getTelevisionBursts } from "../../components/media-containers/TelevisionContainer"
import { getSocialMediaBursts } from "../../components/media-containers/SocialMediaContainer"

const today = new Date()

// Stub form with the minimal getValues shape the helpers expect
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

const socialBursts = getSocialMediaBursts(socialForm, 0)
assert.equal(socialBursts[0].mediaAmount, 0, "Social bonus should keep media at 0")
assert.equal(socialBursts[0].feeAmount, 0, "Social bonus should keep fee at 0")
assert.equal(
  socialBursts[0].deliverables,
  8,
  "Social bonus keeps editable deliverables"
)
assert.equal(socialBursts[0].buyType, "bonus")

console.log("Bonus buy type burst helpers passed")







