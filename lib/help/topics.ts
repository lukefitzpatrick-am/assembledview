/**
 * In-app help (switch `in_app_help`). One topic per route pattern from
 * `lib/nav/routeManifest.ts`; a page with no topic of its own uses its
 * nearest parent's. Inline tips are keyed by id so a typo is a type error.
 *
 * The long-form guide is docs/handbook/06-user-guide.md. Change both together.
 * Client-facing routes (/dashboard/*, /knowledge/*) are written for clients:
 * no internal process, names or figures.
 */
import { matchRoute } from "@/lib/nav/routeManifest"

type HelpStep = {
  text: string
  /** Element id on the page; the panel offers "Show me" and scrolls to it. */
  anchor?: string
}

export type HelpTopic = {
  title: string
  summary: string
  steps?: readonly HelpStep[]
  tips?: readonly string[]
  links?: readonly { label: string; href: string }[]
}

const GLOSSARY = { label: "Glossary", href: "/knowledge/definitions" }

const PLAN_STEPS: readonly HelpStep[] = [
  {
    text: "Campaign setup: pick the client, name the campaign, set start and end dates and the total budget.",
    anchor: "campaign-setup",
  },
  {
    text: "Channel allocation: turn on each channel you are buying, then add a line per placement with its bursts (dates, budget, buy type).",
    anchor: "channel-allocation",
  },
  {
    text: "MBA & billing: check the billing schedule month by month. Exclude a channel from the MBA here if it is not approved yet.",
    anchor: "mba-billing",
  },
  {
    text: "Review & files: check the totals, then publish. Publishing creates the version clients, billing and pacing read.",
    anchor: "review-export",
  },
]

export const HELP_TOPICS: Readonly<Record<string, HelpTopic>> = {
  "/mediaplans": {
    title: "Campaigns",
    summary: "Every media plan, newest first. Live and Completed come from the campaign dates.",
    steps: [
      { text: "Search or filter to find a campaign, then open it to edit." },
      { text: "Use Create Campaign to start a new plan." },
    ],
    tips: ["A plan only reaches billing, pacing and client dashboards once a version is published."],
  },
  "/mediaplans/create": {
    title: "Create a campaign",
    summary: "Build a plan in four steps. The rail on the left jumps between them and keeps a running budget summary.",
    steps: PLAN_STEPS,
    tips: [
      "Draft downloads are watermarked DRAFT and are not for the client.",
      "Unallocated in the bottom bar turns amber when lines add up to more than the budget.",
      "Ask AVA (bottom right, admins) can load a publisher schedule into the form for you to check.",
    ],
    links: [GLOSSARY],
  },
  "/mediaplans/mba/[mba_number]/edit": {
    title: "Edit a campaign",
    summary: "Change a plan and publish a new version. Clients and billing keep the last published version until you publish again.",
    steps: [
      ...PLAN_STEPS,
      { text: "If someone else has the plan open, a banner names them. Agree who saves first: the second save is refused if the published version moved." },
    ],
    tips: [
      "Save draft keeps your changes without changing what clients see.",
      "Creative and Trafficking are linked from the rail once the plan has an MBA number.",
    ],
    links: [GLOSSARY],
  },
  "/mediaplans/mba/[mba_number]/creative": {
    title: "Campaign creative",
    summary: "Upload and review creative for this campaign.",
  },
  "/mediaplans/mba/[mba_number]/trafficking": {
    title: "Trafficking",
    summary: "Generate platform names from the published plan lines so delivery can be matched back to each line.",
    tips: ["Names carry the plan code pacing uses to match delivery to the line. Rename here, not in the ad platform."],
  },
  "/mediaplans/mba/[mba_number]/ingest/[stageId]": {
    title: "Parse review",
    summary: "Check a publisher schedule the app has read before it goes into the plan.",
    steps: [
      { text: "Work down each row: accept, change or drop what was read." },
      { text: "Confirm to load the accepted rows into the plan form, then review and save the plan as usual." },
    ],
  },
  "/finance": {
    title: "Finance",
    summary: "Billing, publisher costs, forecasting and reconciliation. Money here is ex GST unless a page says otherwise.",
    steps: [
      { text: "Pick the month and scope in the bar at the top. Every section uses it." },
      { text: "Work the month in order: To bill, then In Xero, then Owed." },
    ],
  },
  "/finance/invoicing": {
    title: "Clients billing: to bill",
    summary: "What each client should be invoiced this month, from the published plans' billing schedules.",
    steps: [
      { text: "Check each client card against its plans. Fix a wrong amount in the plan, not on the invoice." },
      { text: "Approve the rows that are right. Approve ready approves every row with no blocker, after you confirm." },
      { text: "Send to accounts sends the approved month as a pack. Send clearance emails the check against Xero drafts." },
    ],
  },
  "/finance/in-xero": {
    title: "In Xero",
    summary: "Match Xero draft invoices to the approved records before they are authorised.",
    steps: [
      { text: "Each draft shows the approved amount beside the Xero figure." },
      { text: "Match the pair, adopt the Xero figure, or mark the difference disputed." },
    ],
    tips: ["The nightly sync matches most invoices. Only what it could not match waits here."],
  },
  "/finance/owed": {
    title: "Owed",
    summary: "The debtors ledger from Xero: what clients still owe, by age. Amounts here include GST.",
  },
  "/finance/billing-partner": {
    title: "Billing partner",
    summary: "Packs for Advertising Associates for the billing month: build, send and download.",
  },
  "/finance/reports/true-up": {
    title: "True-up",
    summary: "Invoiced against the billing schedule for every published plan, by component and month.",
    steps: [
      { text: "Start with plans marked as needing action." },
      { text: "Open a row to see the months that differ, then fix the schedule or explain the difference." },
    ],
    tips: [
      "Only invoices approved and sent in Xero count as invoiced.",
      "A gap under $1 counts as a match.",
    ],
  },
  "/finance/costs": {
    title: "Publishers",
    summary: "Publisher invoices, accruals and client-pays lines for the month.",
  },
  "/pacing": {
    title: "Pacing",
    summary: "Delivery against plan for live campaigns. Figures run to yesterday.",
    steps: [
      { text: "Portfolio shows every live campaign at a glance. Start there." },
      { text: "Open a channel tab for line-level pacing, or open a campaign for its detail." },
      { text: "Use the scenario planner on a card to test a budget change before you make it." },
    ],
    tips: [
      "Behind is under 90% of expected delivery, on track is 90% to 110%, ahead is over 110%.",
      "A line with no delivery may not be matched yet. Check Relabels.",
    ],
  },
  "/pacing/admin/relabels": {
    title: "Relabels",
    summary: "Attach platform delivery that has not matched a plan line, and undo a relabel if it was wrong.",
    steps: [
      { text: "Pick a client or MBA on the Match tab." },
      { text: "Preview the relabel, check the lines it moves, then apply." },
      { text: "Unmapped lists recent delivery that attaches to no published line." },
    ],
  },
  "/tasks": {
    title: "Codex",
    summary: "Tasks, projects and meeting follow-ups for the team.",
    steps: [
      { text: "Filter the list to your own tasks first, then by client or due date." },
      { text: "Open a project for its board or list. Drag a card to change its status." },
      { text: "AVA can propose tasks from meeting notes. Accept a proposal to turn it into a task." },
    ],
  },
  "/client": {
    title: "Clients",
    summary: "Client records: contacts, fees, platform accounts and the client's dashboard.",
    tips: ["A new plan loads its fee percentages from the client record when you pick the client. Check them before publishing."],
  },
  "/publishers": {
    title: "Publishers",
    summary: "Publisher records, schedule parsing profiles and material specs.",
  },
  "/scopes-of-work": {
    title: "Scopes of work",
    summary: "Create, edit and download scopes of work with their cost and billing schedule.",
  },
  "/admin/features": {
    title: "Features",
    summary: "Turn features on and off. Each switch says what it does and what must be true first.",
    tips: ["Turn one switch on at a time and check the page it changes."],
  },
  "/dashboard": {
    title: "Dashboards",
    summary: "Campaign performance. Planned figures come from the published plan. Delivery comes from the ad platforms and runs to yesterday.",
    links: [GLOSSARY],
  },
  "/dashboard/[slug]/[mba_number]": {
    title: "Campaign dashboard",
    summary: "One campaign: where it is now, delivery by channel, and results against targets.",
    steps: [
      { text: "Where we are shows spend to date against plan: ahead, on track or behind." },
      { text: "Each channel section shows delivery against plan, day by day." },
    ],
    tips: ["A chart that says Awaiting first report fills in after the platform's first daily file."],
    links: [GLOSSARY],
  },
  "/knowledge": {
    title: "Knowledge Hub",
    summary: "Guides, platform playbooks, a glossary, calculators and a UTM builder.",
  },
}

export const HELP_TIPS = {
  planUnallocated: "Budget less everything allocated to lines. Amber means the lines add up to more than the budget.",
  planPublish:
    "Publish creates the version that clients, billing and pacing read. On a plan that is already published, Save draft keeps your work without changing what they see.",
  financeScope: "Every finance section uses this month and scope. Change it once here.",
} as const

export type HelpTipId = keyof typeof HELP_TIPS

/** The topic for a page, or its nearest parent's. */
export function helpTopicFor(pathname: string): HelpTopic | null {
  for (let p = pathname; p; p = p.slice(0, p.lastIndexOf("/"))) {
    const key = matchRoute(p)?.path
    if (key && HELP_TOPICS[key]) return HELP_TOPICS[key]
  }
  return null
}
