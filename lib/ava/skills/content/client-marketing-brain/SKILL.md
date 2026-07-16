---
name: client-marketing-brain
description: >-
  Build or update the client marketing brain stored in clients.client_brain.
  Use for "set up the client brain", "create the marketing brain for {client}",
  "onboard {client}", "update {client}'s brain", "client brain", "marketing brain",
  or Client Hub "Create brain". Researches the brand, interviews one question at
  a time, drafts the standard template, and saves via save_client_brain.
metadata:
  version: 1.0.0
---

You are building the **marketing brain** for a client: the definitive, always-current
briefing document that grounds every piece of copy, every insight, and every recommendation
Assembled Media produces for them. It is built from two sources, in this order:

1. **Online research** — the client's own website and social channels, plus category and
   competitor context.
2. **An interview** with the Assembled person setting the client up — they hold the context
   research can't reach (objectives, positioning nuance, compliance, what the client hates).

Never invent facts. Anything you could not verify in research and did not hear in the
interview does not go in the brain. If a section is thin, write what is known and mark the
gap — a short true brain beats a long plausible one.

### Step 1 — Load what exists

Call `get_client_brain` for the client. If a brain already exists, this run is an **update**:
show the person a one-paragraph summary of what's there and ask what has changed, rather than
starting from zero. Note which of the link fields (`website`, `facebook_url`,
`instagram_url`, `linkedin_url`, `tiktok_url`) are already populated.

### Step 2 — Research

Using web search, establish and verify:

- **Identity & links** — official website; official Facebook, Instagram, LinkedIn and TikTok
  pages (the Australian/local page where both global and AU pages exist, since Assembled
  plans AU media). A link goes in only if you are confident it is the official page — check
  the handle, follower plausibility, and that the site links to it. If a channel doesn't
  exist, record it as none rather than the closest match.
- **What they sell** — products/services, price tier, where they're bought (online, retail,
  dealer, direct).
- **Category & competitors** — who they compete with in the Australian market, and roughly
  how the client is positioned against them.
- **How they talk** — tone of voice as evidenced on the website and socials (formal/playful,
  first-person/institutional, claims they lean on).
- **Distinctive brand assets** — logos, colours, taglines, characters, sonic cues the brand
  consistently uses (these matter for copy: they are how mental availability gets built).
- **Anything newsworthy** — recent launches, campaigns, sponsorships, controversy.

Keep research to the point: this feeds a working document, not a report.

### Step 3 — Interview

Interview the Assembled person in chat, **one question at a time**, adapting to what
research already answered — confirm rather than re-ask. Core question set:

1. In one sentence, what does this client actually want media to achieve this year?
   (Growth? Launch? Defend share? Leads?)
2. Who are we really trying to reach — and is that broad category buyers or a tighter
   segment? Any audience the client insists on that we should note separately?
3. How does the client describe their own positioning/USP? Does it differ from how we'd
   describe it?
4. Who do THEY consider competitors (often different from the researched list)?
5. Key messages and proof points the client wants used — and any claims we must never make
   (compliance, legal, licensing)?
6. Tone: how should copy sound, and what would make the client reject a draft on sight?
7. Seasonal moments, key trading periods, events that matter to them?
8. Anything about the relationship AVA should know when writing for them — sensitivities,
   history, pet peeves, mandatory inclusions (T&Cs, disclaimers)?

Stop when the sections below can be filled honestly — don't interrogate for completeness.

### Step 4 — Compose the brain

Write `client_brain` as markdown using exactly this structure:

```markdown
# {Client name} — Marketing Brain
_Last updated: {date} · Sources: research + interview with {name}_

## Snapshot
One tight paragraph: who they are, what they sell, where, to whom, and what media is for.

## Objectives
What media/marketing must achieve, in the client's terms. Bullet the KPIs if known.

## Category & competitors
The category as bought by consumers, key competitors (client-named ones flagged), and the
client's position in it.

## Audience
Who buys the category, who we're targeting, and any client-mandated segments. Prefer broad
reach framing with tighter segments as overlays, not replacements.

## Positioning & USPs
The client's positioning statement and the proof behind it.

## Distinctive brand assets
Taglines, colours, logos, characters, sonic cues — what must show up in creative for the
brand to get credited.

## Tone of voice
How copy should sound, with a do/don't pair or two taken from real examples.

## Key messages & proof points
The claims we lead with and the evidence for each.

## Compliance & never-say
Claims we must not make, mandatory disclaimers, legal/regulatory constraints.

## Moments & seasonality
Trading periods, events, sponsorships that shape the calendar.

## Working notes
Relationship context, client preferences, things that get drafts rejected. (Living section —
append, don't rewrite.)
```

Rules of composition: every claim traceable to research or the interview; competitors the
client named are marked "(client-named)"; gaps stated as gaps ("Tone: not yet discussed —
default to website register"); no marketing-theory lectures inside the brain — it's a
briefing, not an essay.

### Step 5 — Confirm and save

Show the full draft in chat. After the person confirms (or edits), save with
`save_client_brain` — which writes `client_brain`, sets `client_brain_updated_at`, and
updates any link fields you verified in Step 2 that were previously empty. Never overwrite a
non-empty link field without asking. Confirm the save by reading it back.

### When other tasks use the brain

This skill also defines the contract for the rest of AVA: **any copywriting or insight task
for a client must call `get_client_brain` first** and treat its Compliance & never-say and
Tone sections as hard constraints. If the brain is empty, say so and offer to run this skill
before writing.
