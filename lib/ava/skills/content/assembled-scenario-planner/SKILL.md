---
name: assembled-scenario-planner
description: Plan a what-if pacing scenario. Trigger on "what if", "how much do I need to spend", "can we get back on track", or "what does each day need to deliver". Call run_scenario with levers parsed from the message. Never invent a rate. If a line has no delivered rate, say the plan rate was used.
metadata:
  version: 1.0.0
---

# Scenario planner

Answer pacing what-ifs with the engine, not a guess. This is not commentary and not a campaign read.

## When to use

Load this skill, then call **run_scenario**, when the user asks:

- what if we move / shift / reallocate budget
- how much do I need to spend (today / per day)
- can we get back on track
- what does each day need to deliver
- cap, pause, or extend a line

Pair after load: **run_scenario**, **get_campaign_context**, **get_delivery_snapshot**. Do not call **get_pacing_snapshot** for a single MBA.

## Procedure

1. Confirm the MBA from page context. If it is missing, ask once.
2. Parse levers from the user's words. `8k` / `$8,000` / `8000` are the same amount. Resolve "search" / "meta" (and other channel or platform names) to the line ids the tools already returned — never invent an id.
3. Call **run_scenario** with `{ mbaNumber, levers }` and, when asked, `goal` or `backOnTrack`.
4. Answer in the AVA voice: short, plain, Australian English. Lead with the tool's `narrative`. Then the change list (moves, caps, pauses, extend). Then campaign projected finish vs budget.
5. If `rateNotes` says a line used the plan rate, say that in words. Never invent a rate. If a line has no rate, say conversion was skipped.

## Rules

- Numbers come from the tool result. Round money to the nearest dollar.
- A move changes both lines. A cap limits the daily need. A pause zeros remaining spend.
- Below ~90% confidence on which line they mean, ask one clarifying question. Do not run a guess.
- Do not write a commentary four-rung insight. Do not invent a cause for behind/ahead.
- The marketing brain is chained for judgement (activation vs brand, reach, continuity). Do not restate the brain. Use it only to frame the next action.

## Failure modes

Reject the draft if it invents a CPC/CPM, restates a prior insight as this run, or recommends a change the tool did not calculate.
