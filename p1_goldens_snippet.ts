/** Frozen output of mapRadioExpertRowsToStandardLineItems (feePctRadio: 10). */
const RADIO_GOLDEN = [
  {
    "network": "SCA",
    "station": "2DAY",
    "buyType": "spots",
    "bidStrategy": "",
    "placement": "Breakfast",
    "format": "Spot",
    "duration": "30s",
    "buyingDemo": "A25-54",
    "market": "SYD",
    "platform": "",
    "creativeTargeting": "",
    "creative": "",
    "fixedCostMedia": false,
    "clientPaysForMedia": false,
    "budgetIncludesFees": true,
    "noadserving": false,
    "lineItemId": "R1",
    "line_item_id": "R1",
    "line_item": 1,
    "lineItem": 1,
    "bursts": [
      {
        "budget": "2777.78",
        "buyAmount": "$250.00",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 10
      },
      {
        "budget": "1388.89",
        "buyAmount": "$250.00",
        "startDate": "2026-01-11",
        "endDate": "2026-01-17",
        "calculatedValue": 5
      }
    ]
  },
  {
    "network": "ARN",
    "station": "KIIS",
    "buyType": "package_inclusions",
    "bidStrategy": "",
    "placement": "",
    "format": "",
    "duration": "",
    "buyingDemo": "",
    "market": "MEL",
    "platform": "",
    "creativeTargeting": "",
    "creative": "",
    "fixedCostMedia": true,
    "clientPaysForMedia": false,
    "budgetIncludesFees": false,
    "noadserving": false,
    "lineItemId": "R2",
    "line_item_id": "R2",
    "line_item": 2,
    "lineItem": 2,
    "bursts": [
      {
        "budget": "0",
        "buyAmount": "0",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 100
      }
    ]
  }
]

/** Frozen output of mapCinemaExpertRowsToStandardLineItems (feePctCinema: 10). */
const CINEMA_GOLDEN = [
  {
    "network": "Event",
    "station": "Bondi",
    "buyType": "spots",
    "bidStrategy": "",
    "placement": "Pre-show",
    "format": "Spot",
    "duration": "30s",
    "buyingDemo": "A18-39",
    "market": "SYD",
    "fixedCostMedia": false,
    "clientPaysForMedia": false,
    "budgetIncludesFees": true,
    "noadserving": false,
    "lineItemId": "C1",
    "line_item_id": "C1",
    "line_item": 1,
    "lineItem": 1,
    "bursts": [
      {
        "budget": "1600",
        "buyAmount": "$180.00",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 8
      },
      {
        "budget": "800",
        "buyAmount": "$180.00",
        "startDate": "2026-01-11",
        "endDate": "2026-01-17",
        "calculatedValue": 4
      }
    ]
  },
  {
    "network": "HOYTS",
    "station": "Chadstone",
    "buyType": "bonus",
    "bidStrategy": "",
    "placement": "",
    "format": "",
    "duration": "",
    "buyingDemo": "",
    "market": "MEL",
    "fixedCostMedia": false,
    "clientPaysForMedia": true,
    "budgetIncludesFees": false,
    "noadserving": false,
    "lineItemId": "C2",
    "line_item_id": "C2",
    "line_item": 2,
    "lineItem": 2,
    "bursts": [
      {
        "budget": "0",
        "buyAmount": "0",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 50
      }
    ]
  }
]

/** Frozen output of mapDigiVideoExpertRowsToStandardLineItems (feePctDigiVideo: 10). */
const DIGI_VIDEO_GOLDEN = [
  {
    "platform": "YouTube",
    "site": "yt.com",
    "bidStrategy": "views",
    "buyType": "cpv",
    "publisher": "Google",
    "placement": "instream",
    "size": "15s",
    "targetingAttribute": "",
    "creativeTargeting": "ctx",
    "creative": "v1",
    "buyingDemo": "A25-54",
    "market": "AU",
    "fixedCostMedia": false,
    "clientPaysForMedia": false,
    "budgetIncludesFees": true,
    "noadserving": false,
    "lineItemId": "DV1",
    "line_item_id": "DV1",
    "line_item": 1,
    "lineItem": 1,
    "bursts": [
      {
        "budget": "750",
        "buyAmount": "$0.05",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 13500
      },
      {
        "budget": "250",
        "buyAmount": "$0.05",
        "startDate": "2026-01-11",
        "endDate": "2026-01-17",
        "calculatedValue": 4500
      }
    ]
  },
  {
    "platform": "Meta",
    "site": "",
    "bidStrategy": "",
    "buyType": "cpm",
    "publisher": "Meta",
    "placement": "",
    "size": "",
    "targetingAttribute": "",
    "creativeTargeting": "",
    "creative": "",
    "buyingDemo": "",
    "market": "",
    "fixedCostMedia": false,
    "clientPaysForMedia": false,
    "budgetIncludesFees": false,
    "noadserving": false,
    "lineItemId": "DV2",
    "line_item_id": "DV2",
    "line_item": 2,
    "lineItem": 2,
    "bursts": [
      {
        "budget": "960",
        "buyAmount": "$12.00",
        "startDate": "2026-01-05",
        "endDate": "2026-01-10",
        "calculatedValue": 80000
      }
    ]
  }
]
