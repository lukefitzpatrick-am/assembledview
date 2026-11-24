# 06 Using AssembledView

How to do each job in the app, step by step. Written for planners, finance, account managers and clients.

The in-app Help panel (top bar, when the `in_app_help` switch is on) shows the short form of each section below for the page you are on. Its content lives in `lib/help/topics.ts`. Change this page and that file together.

## Getting around

- **Sidebar.** Grouped as Plan, Deliver, Finance and Admin. Dashboards and the Knowledge Hub sit at the top.
- **Search.** Press Ctrl K (or the Search pill in the top bar) to jump to a campaign, client, publisher or page. Type `?` in an empty search box for keyboard shortcuts.
- **Help.** The Help button in the top bar opens a panel for the page you are on: what it is for, the steps, and things to know. Steps that point at part of the page have a Show me link that takes you there.
- **? tips.** A small `?` beside a figure or control explains it. Click it, or tab to it and press Enter. Press Escape to close it.
- **Colour mode.** Light or Black, top right.
- **Ask AVA.** Admins have AVA in the bottom right corner. It can read campaigns, pacing and finance, and fill plan forms for you to check.

## Who sees what

- **Staff (admin)** see every section.
- **Clients** see their own dashboards, their creative and the Knowledge Hub. Nothing else is reachable.
- **View as client.** When it is switched on, an admin can see the app exactly as a client does, read only. A banner shows while you are viewing.

## Plan a campaign

Campaigns (`/mediaplans`) lists every media plan, newest first. Live and Completed come from the campaign dates.

### Create

Open **Create Campaign**. The plan builds in four steps. The rail on the left jumps between them and keeps a running summary.

1. **Campaign setup.** Pick the client, then name the campaign and set start date, end date and total budget. Picking the client loads its fee percentages from the client record.
2. **Channel allocation.** Turn on each channel you are buying. In each channel, add a line per placement and its bursts (dates, budget, buy type).
3. **MBA & billing.** Check the billing schedule month by month and the KPIs. Exclude a channel from the MBA here if it is not approved yet.
4. **Review & files.** Check the totals, then publish.

With tracking type per line switched on, each line card has a **Tracking** control: Tracked (platform or ad server data), Supplier reported (the supplier's own file), Assumed (even spend from the plan) or Not tracked. It starts on the line's default, marked (default). Change it only when the line's data differs from that.

The bar at the bottom shows Budget, Allocated and Unallocated. Unallocated turns amber when the lines add up to more than the budget.

**Files** gives draft downloads before you publish: draft MBA, draft Media Plan and, for Advertising Associates clients, the draft AA plan. Drafts are watermarked DRAFT and are not for the client.

### Publish

Publishing creates a numbered version. That version is what clients, billing, pacing and every report read. Nothing before it is visible to them. **Publish & download all** (on the Publish menu) publishes and downloads the MBA, media plan and naming in one zip.

If a publish is refused, the message says why and what to change.

### Edit

Open a campaign from the list. You are editing a working copy.

- **Save draft** keeps your changes without changing the published version.
- **Publish** creates the next version.
- If someone else has the plan open, a banner names them. If they publish first, your publish is refused so you do not overwrite them. Reload and reapply your change.
- **Creative** and **Trafficking** for the campaign are linked from the rail.

### Load a publisher schedule

Upload a publisher's schedule spreadsheet (Admin, Schedule ingest, or ask AVA on the plan). The app reads it into a **Parse review**:

1. Work down each row: accept, change or drop what was read.
2. Confirm to load the accepted rows into the plan form.
3. Review the plan and publish as usual.

### Trafficking

Trafficking builds the platform names from the published plan lines. The names carry the plan code that pacing uses to match delivery back to each line. Rename here, not in the ad platform.

## Finance month

Finance works on a month and scope set in the bar at the top of every section. Set it once. Money is ex GST unless a page says otherwise. Owed shows Xero amounts, which include GST.

Work the month in this order.

1. **To bill** (Clients billing). Each client card shows what to invoice this month from the published plans' billing schedules. If an amount is wrong, fix the plan (republish or a billing revision), not the invoice.
2. **Approve.** Approve each row that is right. **Approve ready** approves every row with no blocker, after you confirm the count and total.
3. **Send to accounts** sends the approved month to the accounts team as a pack. **Send clearance** emails the check of Xero drafts against what the app expects.
4. **In Xero.** Each Xero draft sits beside the approved amount. Match the pair, adopt the Xero figure, or mark the difference disputed. The nightly sync matches most invoices on its own.
5. **Owed.** The debtors ledger from Xero, by age.

Other sections:

- **Billing partner.** Advertising Associates packs for the month.
- **Publishers.** Publisher invoices, accruals, client-pays lines and fixed cost margin.
- **Forecasting** and **Investment.** Booked against targets, and spend and margin.
- **Invoiced vs expected** and **Plan reconciliation.** Checks of the app's figures against Xero and against the billing schedule.
- **True-up.** Every published plan's invoices against its billing schedule. Only invoices approved and sent in Xero count. A gap under $1 counts as a match. Open a row to fix the schedule or explain the difference.

For invoices to match their plan, put the MBA in the Xero Reference: see [Xero reference convention](./xero-reference-convention.md).

## Pacing

Pacing shows delivery against plan for live campaigns, to yesterday.

1. **Portfolio** shows every live campaign at a glance. Start there.
2. **Overview** lists lines that need attention.
3. The channel tabs (Direct, Programmatic, Social, Search, Ad serving) show each line's pacing.
4. Open a campaign for its detail. The **scenario planner** on a card tests a budget change before you make it.

Status: **behind** is under 90% of expected delivery, **on track** is 90% to 110%, **ahead** is over 110%.

A line with no delivery may not be matched to the plan yet. **Relabels** (Admin) attaches unmatched delivery to a plan line: pick a client or MBA on Match, preview, check the lines it moves, then apply. A relabel can be reverted. **Unmapped** lists recent delivery that matches no published line. Each row says what to do and, where it can, which line to relabel to. Where an old line id could belong to a line that already has this delivery, the row says **Check on Match** and links to the Match tab, which spots double counting. With the unmatched delivery queue switched on, it also shows how many days (within the last 30) the delivery has been unmatched. After 3 days, when the platform name has no plan line id or an old one, **Copy supplier note** gives a draft asking the supplier or trader to put the current plan line id in the name. The app does not send it. The pacing digest counts the queue and links to it.

## Client dashboards

What a client sees for each campaign:

- **Where we are:** spend to date against plan, as ahead, on track or behind.
- **Delivery by channel:** day by day against plan. A chart that says "Awaiting first report" fills in after the platform's first daily file.
- **Creative** and, where set up, **Web & search**.

Planned figures come from the published plan. Delivery comes from the ad platforms and runs to yesterday.

## Codex

Codex (`/tasks`) holds the team's tasks, projects and meeting follow-ups.

1. Filter the list to your own tasks first, then by client or due date.
2. Open a project for its board or list. Drag a card to change its status.
3. AVA can propose tasks from meeting notes. Accept a proposal to turn it into a task.

Outside Codex, pages link into it to make changes.

## Clients, publishers and scopes

- **Clients.** Contacts, fee percentages, platform accounts and the dashboard. Fee percentages load into every new plan for the client. With fee rates from a date switched on, Fee rate changes on the client sets a new rate from a date: a plan takes each fee at its start date (the latest change on or before it, else the Fees box). Plans that started earlier keep their rate when saved again, and published versions never change. A date before today shows a warning: plans that start on or after it, including running ones, take the new rate the next time they are saved. Delete asks first.
- **Publishers.** Records, schedule parsing profiles and material specs.
- **Scopes of work.** Create, edit and download scopes with their cost and billing schedule.

## Admin

- **Features.** Turns features on and off. Each switch says what it does and what must be true first. Turn one on at a time and check the page it changes.
- **Users.** Add and manage people and their access.
- **Data quality** (`/data-quality`, when switched on). Data problems the app's checks find every morning: a published plan line with no publisher, burst dates outside the plan or out of order, overlapping bursts, a package with no quantity, and relabel drift. Each item names the plan, the line and the rule, links to the fix, and goes to the plan owner: the client's finance owner, else whoever last published the plan. Test and internal clients are left out. The page opens on your own items (Mine), overdue first. Filter by owner, rule or client, or tick Overdue only (open more than 3 days). Resolve asks you to confirm, then marks an item done; a problem still there comes back the next morning. Dismiss needs a reason and stops it coming back for good. The pacing digest shows how many items are overdue, by owner. Publish problems are listed whether or not publish refuses them yet. Clients never see this page.

## Getting help

- The Help panel on each page.
- The [Knowledge Hub](/knowledge): guides, glossary, formulas, calculators and a UTM builder.
- Support: hello@assembledmedia.com.au.
