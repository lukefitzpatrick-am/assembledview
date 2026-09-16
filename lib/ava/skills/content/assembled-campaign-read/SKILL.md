---
name: assembled-campaign-read
description: Write the six-beat campaign read for the client dashboard. Trigger on "campaign read", "write the read", or the dashboard Regenerate action. Ground every number in a tool. Never invent a cause.
metadata:
  version: 1.0.0
---

# Campaign read

A campaign read is six short beats for the client, in a fixed order. It is not commentary, not a PCA, and not a performance report. Each beat is 1-3 sentences. Each number is copied from a tool result. If a beat has no evidence, write exactly `Nothing to report yet.` for that beat.

## Procedure

1. Load this skill's `references/voice.md` and follow it as the voice contract (Luke approves that file before ship).
2. Call these tools for the MBA on the page (or supplied in the request):
   - **get_campaign_context**
   - **get_delivery_snapshot**
   - **get_campaign_insights** (live rows only — context, never a numeric source)
   - Campaign KPI review rows (the `buildKpiReview` / campaign_kpi payload supplied with the generate job). There is no separate KPI tool — do not invent one.
   - Do **not** call **get_pacing_snapshot**. Campaign pace is spend-to-date vs expected-to-date on the delivery snapshot totals (same figures as the dashboard strip).
3. Write the six beats in this order. Do not reorder. Do not add a seventh.

| Key | Heading | What it answers |
|---|---|---|
| `planned` | What was planned | Booked mix, flight, budget, targets — from the plan / context. |
| `happened` | What has happened | Delivered spend, deliverables, time elapsed — from the delivery snapshot. |
| `vsPlan` | Against the plan | Pace vs expected. Name the channel and platform that drives the gap. |
| `best` | Best thing going on | The strongest result, with the number that proves it. |
| `worst` | Worst thing | Stated plainly, plus what we are doing about it. No softening. |
| `upcoming` | Coming up | Booked next flights, known catch-up, or the next material date. |

4. Rules while writing:
   - Copy numbers as the tool gave them. Money to the nearest dollar or $K.
   - Never invent a cause. If the cause is not in a tool or a live insight, omit it.
   - Prior insights are context. Do not restate them as this period's finding unless you say what was believed before and what changed.
   - Delivery $ / KPI figures come from **get_delivery_snapshot** / the KPI review payload — never from insight bodies.
   - Name the channel and the platform (Channel Factory, Meta, Seven). Do not say "digital".
   - Talk to the client as "you". The agency is "we".
5. Return **JSON only** (no markdown fence unless you must). Shape:

```
{
  "beats": {
    "planned": "...",
    "happened": "...",
    "vsPlan": "...",
    "best": "...",
    "worst": "...",
    "upcoming": "..."
  },
  "sources": ["get_delivery_snapshot", "get_campaign_context"]
}
```

`sources` lists the tool names you actually used. Omit a source you did not call.

## Failure modes

Reject the draft if any beat invents a number, invents a cause, uses a banned word from `voice.md`, or hides a miss. A miss belongs in `worst` with the recovery action.
