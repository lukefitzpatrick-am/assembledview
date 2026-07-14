---
name: assembled-media-plan-autopopulate
description: Parse an uploaded media-owner plan (xlsx) and populate Assembled View radio or OOH line items and bursts for human review before save. Trigger when the user uploads or attaches a media owner schedule, media plan spreadsheet, radio/OOH booking sheet (ARN, SCA, SEN, QMS, etc.), or asks AVA to auto-populate / import / parse a plan into the create or edit form. Never invent numbers — Stage 1 detects structure; Claude maps; apply only after confirm via apply_parsed_plan.
metadata:
  version: 1.0.0
---

# Media-plan auto-populate (Radio + OOH)

Import a media-owner xlsx into the Assembled View form for **human review**. Never write straight to Xano from this skill.

## Pipeline (do not skip steps)

1. User attaches an `.xlsx` in AVA chat (ChatWidget → `/api/processPlan`).
2. Deterministic detector locates header, flight band, cost columns, junk columns.
3. Claude mapper classifies rows and maps cells → container fields + bursts (**copy numbers from cells only**).
4. You **summarise** the parse in chat (counts, meta, needs_review, warnings).
5. Wait for an explicit user **confirm**.
6. Call `apply_parsed_plan` with `confirm: true` so the client loads lines via the bridge.

## Money rule

Prefer investment / media value / total cells. Only fall back to rate × spots when both are explicit cells and no usable total exists.

## Clarify (90% rule)

If channel is ambiguous (radio vs OOH), ask once. If the pending parse is missing, ask the user to re-attach the file. If confidence is low or `needs_review` is heavy, say so before offering confirm.

## After apply

Confirm that lines are in the form for review and that **Save** (existing batched path) is still required.
