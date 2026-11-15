/**
 * Feature switches (0111). One registry for every on/off feature switch.
 *
 * Rule (Luke, 30 Oct 2026): a new feature adds an entry here, never a new
 * env var. Env vars are only for real secrets and config values.
 *
 * Each switch reads, in order:
 *   1. its feature_switches row (set on /admin/features), once 0111 is applied
 *   2. its old env var, so nothing changes on deploy before anyone toggles
 *   3. its default (off)
 * `source: "vercel"` switches stay env only: they are read in middleware,
 * which cannot query the database. The page shows them as "Set in Vercel".
 *
 * This module is pure (no server-only), so client code can import the keys
 * and labels. Server reads live in lib/features/server.ts.
 */

export type FeatureArea = "finance" | "reporting" | "planning" | "clients" | "platform"

export type FeatureToggleRole = "admin" | "finance_admin"

export type FeatureEnvParse =
  /** on, 1 or true, any case, trimmed */
  | "on_1_true"
  /** exactly "true" after trim */
  | "exact_true"
  /** exactly "true", untrimmed (AUTO_REPORTS_ENABLED) */
  | "exact_true_raw"
  /** "on", any case, trimmed */
  | "on_only"
  /** exactly "1" */
  | "exact_1"

export type FeatureDefinition = {
  key: string
  label: string
  description: string
  area: FeatureArea
  defaultOn: boolean
  /**
   * Server env var read when no switch row exists. Only switches that moved
   * off an env var on 30 Oct have one; new switches leave both out and fall
   * back to `defaultOn`.
   */
  envName?: string
  envParse?: FeatureEnvParse
  /** Sent to the browser in the root layout (client components read it there). */
  clientVisible: boolean
  toggleRole: FeatureToggleRole
  /** "switch": set on /admin/features. "vercel": env only (middleware). */
  source: "switch" | "vercel"
  /** Also needs these switches on (checked by the feature's own getter). */
  requires?: readonly string[]
  /** Why a "vercel" switch can't move to the page. */
  vercelReason?: string
}

export const FEATURE_DEFINITIONS = [
  {
    key: "true_up",
    label: "True-up report",
    description:
      "Finance > Reports > True-up: invoiced vs billing schedule by component and month, and the True-up link on Plan reconciliation.",
    area: "finance",
    defaultOn: false,
    envName: "TRUE_UP",
    envParse: "on_1_true",
    clientVisible: true,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "true_up_actions",
    label: "True-up fixes",
    description:
      "Fixes on the true-up page: carry or spread into the billing schedule, mark explained, one-offs, credit-note flags, invoice links and billing timing. Needs the true-up report on and migration 0109.",
    area: "finance",
    defaultOn: false,
    envName: "TRUE_UP_ACTIONS",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
    requires: ["true_up"],
  },
  {
    key: "true_up_cron",
    label: "Monthly true-up run",
    description: "Runs the true-up at 7 am Sydney on the 2nd, saves the run and emails the summary. Needs the true-up report on.",
    area: "finance",
    defaultOn: false,
    envName: "TRUE_UP_CRON",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
    requires: ["true_up"],
  },
  {
    key: "xero_credit_notes",
    label: "Xero credit notes sync",
    description: "The nightly Xero sync also reads sales credit notes and stores them as negative invoices. Turn off if the sync starts failing.",
    area: "finance",
    defaultOn: false,
    envName: "XERO_SYNC_CREDIT_NOTES",
    envParse: "exact_true",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "billing_revisions",
    label: "Billing revisions",
    description: "The billing revisions panel on media plans (bill ahead, move timing, undo), its routes and Ava's billing revision tools.",
    area: "finance",
    defaultOn: false,
    envName: "BILLING_REVISIONS",
    envParse: "on_1_true",
    clientVisible: true,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "fee_snapshot_write_once",
    label: "Fee snapshot write-once",
    description: "Each published version keeps its first fee snapshot. Off: every publish overwrites it.",
    area: "finance",
    defaultOn: false,
    envName: "FEE_SNAPSHOT_WRITE_ONCE",
    envParse: "on_only",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "client_invoices",
    label: "Invoices for clients",
    description: "Clients see their Xero invoices (paid, due, overdue) and PDFs on their dashboard. Admins see them either way.",
    area: "finance",
    defaultOn: false,
    envName: "CLIENT_INVOICES_ENABLED",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "overdue_digest",
    label: "Overdue invoice digest",
    description: "A weekday email to ops listing overdue Xero invoices.",
    area: "finance",
    defaultOn: false,
    envName: "OVERDUE_DIGEST_ENABLED",
    envParse: "exact_true_raw",
    clientVisible: false,
    toggleRole: "finance_admin",
    source: "switch",
  },
  {
    key: "fixed_cost_margin_from_date",
    label: "Fixed cost margin by the from date",
    description:
      "Finance > Publishers > Fixed cost margin reads each line's fixed cost from date (decision FC9, option C). On: a dated line shows \"Fixed cost from [date]\" on the line, the page and the Excel export, and each of its months is a before-the-date leg (actual) or a fixed cost from the date leg. The date's month is split by the FC6 rule: the days before the date carry their actual spend as billed, and the fixed cost leg is the month's billing less that spend, never below 0. Line, month and report totals don't change. Billing, true-up, accruals and Xero never read the date (FC3). Splitting the date's month needs the Snowflake view VW_PLATFORM_SPEND_LINE_DAY (FC9 migration); until it exists, or while the report reads platform spend from the pacing facts (fallback, when VW_PLATFORM_SPEND_LINE_MONTH can't be read), that month shows unsplit with a note. Lines costed from Xero bills show the date only (bills have no day grain). Also needs the fixed cost from a date and fixed-cost report on net media switches. Off: the report is exactly as before.",
    area: "finance",
    defaultOn: false,
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
    requires: ["fixed_cost_from_date", "fixed_cost_report_net"],
  },
  {
    key: "fixed_cost_margin_no_spend_yet",
    label: "Fixed cost margin: no spend yet is not margin",
    description:
      "Finance > Publishers > Fixed cost margin (C-185). Today a platform-cost line's month with billing and no platform spend recorded counts as margin of the whole billed amount (100%). On: such a month before the current Melbourne month shows \"Billed, no spend recorded\", its margin is blank, and it is left out of margin totals and margin %. A later month is left out of margin the same way (\"Future month, no spend yet\"). The current month keeps today's rule (month to date, spend still arriving). Lines costed from Xero bills already work this way. This can move the report's margin down: a month billed before its platform spend lands leaves margin until spend is recorded. Billed and cost don't change. Billing, true-up, accruals and Xero never read it. Off: the report is exactly as before.",
    area: "finance",
    defaultOn: false,
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "billing_balancer",
    label: "Billing balancer",
    description: "Manual billing edits keep the line total by moving the difference into a balancer month.",
    area: "planning",
    defaultOn: false,
    envName: "NEXT_PUBLIC_BILLING_BALANCER",
    envParse: "on_1_true",
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "plan_drafts",
    label: "Plan autosave drafts",
    description: "Autosave in the media plan editor (browser every 3 seconds, server every 15) and the Save draft button.",
    area: "planning",
    defaultOn: false,
    envName: "NEXT_PUBLIC_PLAN_DRAFTS",
    envParse: "on_1_true",
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "expert_package_quantity",
    label: "Expert grid package quantity",
    description:
      "Applying an expert grid saves a package line's deliverables as the quantity entered, on every channel (decision D1). On also treats every package line as having no unit target, like fixed cost (P14): pacing, client dashboard and deck planned deliverables, the CM360 spend estimate and KPI plan deliverables ignore a package quantity. This clears planned deliverables on existing OOH, radio, TV and newspaper package lines that already carry a quantity (47 live lines on 3 Nov 2026). Also needs the fixed-cost report on net media switch (Snowflake treats package as time based only on net media). Off: the Digital Video, Digital Display, Social, Search, Influencers, Integration and programmatic grids save 0 and the Newspaper and Magazines grids save 1, as before. Turning it off after it was on puts saved package quantities back as targets everywhere. Budgets and billing don't change either way.",
    area: "planning",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["fixed_cost_report_net"],
  },
  {
    key: "publisher_guard",
    label: "Publisher guard on publish",
    description:
      "Publishing a media plan is blocked when a line names a publisher that isn't in Publishers, or a production line has no publisher. A media line with no publisher publishes with a warning. Admins get an Add to Publishers button (decision Q4). Turn on after the B19 publisher merge SQL has run. Off: publish checks no publishers, as before.",
    area: "planning",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "billing_ghost_row_guard",
    label: "Duplicate old-id billing rows: warn and stop save",
    description:
      "The media plan editor checks the billing schedule it loads for an old line id (pre-May ML code, no code, or the old production id) and the current id of the same line, both with money in the same month, which counts that line twice (decision Q16; hema001 v6 and v7, malay003 v4, malay004 v3 and v4 and BOSS001 v14 on 3 Nov 2026). On: a notice names each line and both amounts, the MBA billing window lists each pair with a \"duplicate of\" chip, the editor logs it to app notifications, and Save is refused until the planner chooses \"Keep the current rows\", which removes the old-id rows from this edit only. Saved data is never changed or deleted; the next save writes a new schedule from the plan lines. Off: no check, as before.",
    area: "planning",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "billing_ghost_row_finance_guard",
    label: "Duplicate old-id billing rows: stop finance saves and flag invoices",
    description:
      "The finance side of the duplicate billing row check (MB-37, decision Q16; the editor side is billing_ghost_row_guard). A schedule that holds an old line id (pre-May ML code) and the current id of the same line, both with money in the same month, counts that line twice. On: the billing schedule update (Alter Billing and inline invoice amount edits, PATCH /api/mediaplans/versions/[id]/billing-schedule) is refused with a message naming each line, month and both amounts, and nothing is written; Alter Billing names the pairs and offers \"Keep the current rows\", which removes the old-id rows from that edit (and moves its original total down by the same amount) before Save; an old-id row left with money after its current-id row was zeroed is refused the same way, in Alter Billing and in the update (against the stored schedule), so the line never bills under the old id alone; and the Invoicing page flags each invoice draft that holds a doubled line, naming it, without dropping any row. Saved data is never changed by the check itself. No-code and old production ids are not checked here (the loaded lines are needed to prove them; the editor check does that). Off: as before. Nothing needs to be true first.",
    area: "finance",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "burst_overlap_warning",
    label: "Overlapping bursts: page warning",
    description:
      "The media plan create and edit pages (DQ-5, Q33). On: every line with two bursts whose dates overlap (Sydney civil days, both ends inclusive) is listed in the builder issues, one warning per line naming the first overlap, and the save rail says how many lines overlap. Warn only: saving and publishing are never blocked. The card's own overlap banner under the bursts is already on for every channel and does not read this switch. Off: no page warning, as before. Nothing needs to be true first. Live 13 Nov 2026: 19 lines on 12 published plans overlap.",
    area: "planning",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "partial_mba_billing_guard",
    label: "Partial MBA: billing months and the billing vs delivery check",
    description:
      "The media plan editor's partial MBA (decisions M8, Q11 to Q14). On: the partial MBA fee follows each line's fee billing months, as the published MBA does (with no fee months it stays the media share, as before); when the working billing has no line rows the partial MBA starts from the auto billing months, not the delivery months; and the MBA billing window shows each selected month and line where billing and delivery differ, with a one-line note on the save rail. Client pays for media lines show as expected. Channels added after an old partial MBA was set show as approved. Warn only, never blocks. Off: as before.",
    area: "planning",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "channel_client_fees",
    label: "Client fees on traditional and direct digital",
    description:
      "Client fees on TV, radio, newspapers, magazines, OOH, cinema, digital display, audio and video, BVOD, integration and influencers (decisions P3, P12 and B22; migration 0113). On: the client form shows these 12 fee fields to admins, and the media plan editor reads them from the client, so the next save of a plan bills them. A blank field is 0%. A blank Influencers field uses the Content Creator rate. Off: the form hides the 12 fields and the editor ignores them (Influencers keeps the Content Creator rate), as before, and client saves on the server drop them. Turning it off after a rate is set drops that fee from the next save of that client's plans. Saved and published plans don't change until they're saved again.",
    area: "planning",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "fixed_cost_from_date",
    label: "Fixed cost from a date",
    description:
      "A fixed cost media line can start fixed cost on a date inside its flight (decision FC2). Days before the date keep the line's actual delivery; from the date it reports fixed-cost spend. Shows the date field beside the Fixed Cost Media box, checks it on save, sends it to Snowflake, and splits client dashboards, decks and pacing by day. The fixed-cost margin report reads the date only when its own switch, Fixed cost margin by the from date, is on too (FC9). Also needs the fixed-cost report on net media switch (the remainder after the date is net media). Run SQL 0115 and the Snowflake ALTER first. Off: the field is hidden and every reader treats the line as fixed cost for the whole flight, as before.",
    area: "planning",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["fixed_cost_report_net"],
  },
  {
    key: "fixed_cost_report_net",
    label: "Fixed-cost report on net media",
    description:
      "The nightly Snowflake snapshot sends each fixed-cost burst's net media and Melbourne start and end days, so the fixed-cost report (SP_REFRESH_FIXED_COST_REPORTED_DAILY, B23 version) reports net media, not the fee-inclusive budget (decision FC4), on Melbourne days, and cleans up rows outside the bursts. Changes reported spend on fee-inclusive fixed-cost lines from the next morning. Needs the B23 procedure and the Snowflake ALTER. Off: the snapshot sends nothing new and the procedure keeps the gross budget and UTC days, as before. Turning it off also turns the package rule off (Expert grid package quantity needs this switch), so saved package quantities become targets again.",
    area: "reporting",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "hub_delivered_dedupe",
    label: "Hub Delivered counts social and search once",
    description:
      "Hub and campaign strip Delivered: the Direct (fixed-cost) leg left out only programmatic lines, so a fixed-cost social or search line with platform delivery counted its platform spend and its reported spend (BICAU001SM1 and SM2 on 3 Nov 2026). On: the Direct leg also leaves out social and search lines the snapshot already counts; plan-only social lines keep the Direct leg. Off: as before. Independent of the fixed-cost switches (Luke, 3 Nov 2026).",
    area: "reporting",
    defaultOn: false,
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "web_search",
    label: "Web & search for clients",
    description: "Clients see their Web & search tab once their report is published. Admins see it either way.",
    area: "reporting",
    defaultOn: false,
    envName: "FEATURE_WEB_SEARCH",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "creative_performance",
    label: "Creative performance",
    description: "The Top 3 strip and ads inside each delivery line on campaign dashboards, and creatives in report decks. Off is hidden for everyone.",
    area: "reporting",
    defaultOn: false,
    envName: "FEATURE_CREATIVE_PERFORMANCE",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "auto_reports",
    label: "Monthly auto reports",
    description: "The 4th and 5th of the month crons queue and build one report deck per live MBA.",
    area: "reporting",
    defaultOn: false,
    envName: "AUTO_REPORTS_ENABLED",
    envParse: "exact_true_raw",
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "platform_accounts_web",
    label: "GA4 and Search Console accounts",
    description: "Offers GA4 and Search Console in a client's Platform accounts.",
    area: "clients",
    defaultOn: false,
    envName: "NEXT_PUBLIC_PLATFORM_ACCOUNTS_WEB",
    envParse: "exact_1",
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  /*
   * codex_v2 keeps its CODEX_V2 env fallback until a switch row exists in
   * production (F1, B36). The env value in production is unverified, and
   * dropping the fallback first could switch Codex off. resolveFeature
   * already prefers the row: once the row exists, CODEX_V2 is not read while
   * the switch table is readable. When the read fails (database error, or
   * the 0111 marker read fails) every switch falls back to env, codex_v2
   * included, until the next read. Step 4 closes that.
   * Steps (Luke):
   *   1. On the production /admin/features page, Platform > Tasks (Codex)
   *      shows On or Off with source "Env var CODEX_V2": that is the live
   *      env value. (Or Vercel > avmediaplan > Environment Variables.)
   *   2. Press "Save current values" there. It writes a row at the value
   *      shown, so nothing changes for anyone, and the source becomes Switch.
   *      Turn Codex on only after the F14 Ava patches are deployed.
   *   3. Check: SELECT key, enabled FROM feature_switches WHERE key = 'codex_v2'.
   *   4. A later small change removes envName and envParse below (and the
   *      CODEX_V2 env var can then be deleted in Vercel).
   */
  {
    key: "codex_v2",
    label: "Tasks (Codex)",
    description:
      "The Postgres Codex task module at /tasks, its API and the recurring task run. Until this switch is saved it reads the CODEX_V2 env var: press Save current values on production to keep today's value as a switch.",
    area: "platform",
    defaultOn: false,
    envName: "CODEX_V2",
    envParse: "on_only",
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "codex_roster_aliases",
    label: "Tasks: find people by email alias",
    description:
      "Tasks (Codex) finds a person by any of their email aliases as well as their main email (F16, C-193). On: quick-add @mentions match an alias (@alex, alex@); saving a task, a bulk edit or Ask for help with an alias stores that person's main email and name; an address two people share (samantha@ today) is refused with both names and assigns no one. An address no one holds saves as before. Private projects count an alias login, or a member added by an alias, as that person's main email, and members and owners are stored by main email (B42fix). The bell, its unread count, mark read and the email digest switch treat an alias login as that person (B43). Fix the roster first on the Team tab: a shared alias, and Josh Plumridge's own address as an alias. Needs Tasks (Codex) on. Off: only main emails match, as before.",
    area: "platform",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["codex_v2"],
  },
  {
    key: "codex_search",
    label: "Tasks: search",
    description:
      "A Search button on Tasks (Codex) finds tasks by title, MBA, description and comments, meeting action items waiting in the Inbox, and meetings by title and summary (F8). Staff see what the lists show, internal meetings included (decision 52); Ava never reads it. Works before migration 0116; 0116 adds the meeting summary index that keeps it fast. Needs Tasks (Codex) on. Off: no Search button and GET /api/codex/search is 404.",
    area: "platform",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["codex_v2"],
  },
  {
    key: "codex_saved_views",
    label: "Tasks: saved views",
    description:
      "Tasks (Codex) list and board get a Views menu: save the current filters and layout as a named view, share it with staff, pick a view, rename or delete your own (F8). A view opens by link (/tasks?view=<id>); view=list and view=board still set the layout. Needs migration 0117 (codex_saved_views); before it runs the menu stays hidden and the page loads as today. Needs Tasks (Codex) on. Off: no Views menu and /api/codex/saved-views is 404.",
    area: "platform",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["codex_v2"],
  },
  {
    key: "codex_projects",
    label: "Tasks: projects and sections",
    description:
      "Codex projects (S1, B38 and B39): a Projects tab on Tasks (list, create) and a board per project at /tasks/projects/<id> whose columns are the project's sections (drag between sections changes the section and status, a done section completes the task; drag within a section reorders; section menu to add, rename, move, collapse, set status and delete when empty; inline add; bulk paste up to 200 lines; hide or show completed). Also: a status change from the Tasks list, bulk edit or Tasks board on a task in a project moves it to the matching section, or is refused (409) when the project has no section with that status. B40: a List view per project (grouped by section, tasks without one in a No section group; sort and filter by assignee, due, priority and each field; saved views per project); task detail for project tasks (section, start date, assigned by set by the server, ASAP priority once 0118 is applied (on Tasks it sorts above High and is a filter), milestone, subtasks with their own assignee and dates, never a board card); custom single-select and multi-select (tags) fields per project with values on tasks, chips on cards (show or hide per project) and a settings panel. API under /api/codex/projects. Needs migration 0118 (codex_s1_projects); before it runs the Projects tab and boards say the database needs an update and the routes answer 503 migration_not_applied. B42: a Workload tab on Tasks (open tasks per person by week due, overdue, later and no due date; only tasks you can see). Private projects (B42): once 0118 is applied their tasks show only to the owner, creator and members on every Tasks surface (list, counts, search, task detail, bulk, saved views, Inbox, Team tab) and are left out of read-only panels outside Tasks, with this switch on or off. Needs Tasks (Codex) on. Off: no Projects tab, project boards say projects are off, every /api/codex/projects route is 404, PATCH and bulk behave as before, and nothing reads the new tables. Once 0118 is applied some task paths read the new columns switch or not: a subtask is never treated as a help child (Waiting on, done, reopen, delete), deleting a task deletes its subtasks, and Tasks cards and rows say \"Subtask of\" for a subtask. Before 0118 none of them reads anything new.",
    area: "platform",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["codex_v2"],
  },
  {
    key: "codex_notifications",
    label: "Tasks: notifications",
    description:
      "Codex notifications (B41, plan 5.3): a bell in the header of every Tasks page (Tasks, task detail, project boards and lists) with the unread count, a panel of recent notifications, mark one or all read and a link to the task; notifications for assigned, reassigned, unassigned, mentioned, comment on a task you follow, due date changed, attachment added, added as follower and completed, never for your own action, only for active people on the team list and, on a private project, only for people who can see it; a daily cron at 08:30 Melbourne (vercel.json 30 21,22 * * * UTC, the run in the Melbourne 08:00 hour acts) that adds due tomorrow and overdue notifications and sends one email digest per person of their unread notifications since the last digest (SendGrid, the pacing digest's sender), never in quiet hours (18:00 to 08:00 Melbourne), with a per-person off switch in the bell panel. Needs Tasks: projects and sections on (comments with mentions, followers and attachments live there) and migration 0118 (before it the bell says notifications need a database update and the routes answer 503 migration_not_applied; the cron skips). Teams messages come after go-live. Off: no bell, no notifications written, the cron does nothing.",
    area: "platform",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["codex_projects"],
  },
  {
    key: "codex_progress_field",
    label: "Tasks: project progress field",
    description:
      "Codex progress field (B42, plan 4.2, the SEO rule): in a project's Fields settings the owner or any staff member who can see the project links one single-select field that has a done option as the project's progress field. Then completing a task in that project (from any path: the board, Mark complete, the Tasks list, bulk, Ask for help or the relabel auto-close) sets that field to the done option, and setting the field to the done option completes the task (it moves to the project's first done section). A save that sends a status and the field disagreeing (done with another option or a cleared field, or an open status with the done option) is refused with 409 progress_conflict and nothing changes. One fixed behaviour, not a rules engine. A removed option never counts; a field with no done option, or a deleted field, does nothing. Needs Tasks: projects and sections on and migration 0118. Off: no Progress field setting, the link answers 404, and an existing link does nothing (tasks complete and fields change as before).",
    area: "platform",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["codex_projects"],
  },
  {
    key: "codex_my_work",
    label: "Tasks: My Work tabs",
    description:
      "Codex My Work (B42, plan 3.2): three tabs above the Tasks list and board: Assigned to me, Assigned by me (tasks you gave someone else, recorded from B40) and Following (tasks you follow: the creator and assignee unless they unfollowed, and anyone who followed). Board grouped by status or list, with the usual filters, and saved views keep the tab. Private projects stay private (only tasks you can see). Needs Tasks: projects and sections on and migration 0118 (before it Assigned by me and Following say they need a database update). Off: no tabs; My Tasks works as before.",
    area: "platform",
    defaultOn: false,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
    requires: ["codex_projects"],
  },
  {
    key: "unmapped_delivery",
    label: "Unmapped delivery",
    description:
      "Pacing > Relabels > Unmapped lists the last 30 days of platform delivery (Meta, TikTok, Reddit, Google, Microsoft, programmatic, CM360) that attaches to no published line, with what to do about each. Admins only. Off: the tab shows CM360 placements only.",
    area: "planning",
    defaultOn: true,
    clientVisible: true,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "pacing_digest_data_checks",
    label: "Pacing digest data checks",
    description:
      "The pacing digest email (Tue and Fri 09:30 AEDT, 08:30 AEST; vercel.json 30 22 * * 1,4 UTC) gets a Data checks section (C-180). Two counts: rows in MART.VW_PACING_FACT_CM360_DRIFT, where PACING_FACT differs from CM360 (split into rows inside the 14-day refresh window, which the 06:30 refresh rewrites, and rows outside it, which never fix themselves; up to 10 of those are listed), and channel and platform id keys with more than one active LINE_ITEM_LABEL_MAP row. Each check fails soft: until the CD1 migration creates the drift view, or if a query fails, or the switch read and checks are still running 45 seconds after they start (one deadline for all of them), the line says \"check not available\" and the digest still sends. Adds two or three Snowflake reads to the digest cron (the third lists the out-of-window drift rows, only when there are any). Off: no section, no reads.",
    area: "reporting",
    defaultOn: false,
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "relabel_map_one_active_guard",
    label: "Relabels refuse a second active label map row",
    description:
      "Pacing > Relabels apply and revert (C-180). Every apply and revert already keeps one active LINE_ITEM_LABEL_MAP row per channel and platform id: apply deactivates the key's rows before it inserts, and revert restores the prior row as one new row only when nothing else is active for the key. Both then count the key's active rows in the same transaction. More than one means another change landed at the same moment. On: the apply or revert rolls back and says so (409, \"Reload and try again\"); nothing is written. Off: the count is logged (relabel_label_map_second_active_row) and the write commits, as before. Nothing needs to be true first.",
    area: "planning",
    defaultOn: false,
    clientVisible: false,
    toggleRole: "admin",
    source: "switch",
  },
  {
    key: "view_as",
    label: "View as client",
    description: "Admins can view the app as a client (read only, audited). Also needs a signing secret.",
    area: "platform",
    defaultOn: false,
    envName: "VIEW_AS_ENABLED",
    envParse: "on_1_true",
    clientVisible: false,
    toggleRole: "admin",
    source: "vercel",
    vercelReason: "Read in middleware on every request, which can't query the database. Change it in Vercel.",
  },
] as const satisfies readonly FeatureDefinition[]

export type FeatureKey = (typeof FEATURE_DEFINITIONS)[number]["key"]

export type ClientFeatureKey = Extract<(typeof FEATURE_DEFINITIONS)[number], { clientVisible: true }>["key"]

export const FEATURE_KEYS: readonly FeatureKey[] = FEATURE_DEFINITIONS.map((d) => d.key)

export const CLIENT_FEATURE_KEYS = FEATURE_DEFINITIONS.filter((d) => d.clientVisible).map((d) => d.key) as ClientFeatureKey[]

const BY_KEY = new Map<string, FeatureDefinition>(FEATURE_DEFINITIONS.map((d) => [d.key, d]))

export function featureDefinition(key: string): FeatureDefinition | undefined {
  return BY_KEY.get(key)
}

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && BY_KEY.has(value)
}

/** Parses an env value exactly as the feature read it before 0111. */
export function parseFeatureEnv(raw: string | undefined, parse: FeatureEnvParse): boolean {
  switch (parse) {
    case "on_1_true": {
      const v = String(raw ?? "").trim().toLowerCase()
      return v === "on" || v === "1" || v === "true"
    }
    case "exact_true":
      return String(raw ?? "").trim() === "true"
    case "exact_true_raw":
      return raw === "true"
    case "on_only":
      return String(raw ?? "").trim().toLowerCase() === "on"
    case "exact_1":
      return raw === "1"
  }
}

export type FeatureSource = "switch" | "env" | "default" | "vercel"

export type FeatureRow = {
  key: string
  enabled: boolean
  updatedAt: string | null
  updatedBy: number | null
  updatedByName: string | null
  note: string | null
}

/**
 * Pure resolution. `rows` is null when the table can't be read (0111 not
 * applied or the database errored): every switch then falls back to env.
 */
export function resolveFeature(
  def: FeatureDefinition,
  rows: ReadonlyMap<string, FeatureRow> | null,
  env: Record<string, string | undefined>,
): { enabled: boolean; source: FeatureSource } {
  if (def.source === "vercel") {
    const raw = def.envName ? env[def.envName] : undefined
    return { enabled: def.envParse ? parseFeatureEnv(raw, def.envParse) : def.defaultOn, source: "vercel" }
  }
  const row = rows?.get(def.key)
  if (row) return { enabled: row.enabled, source: "switch" }
  const raw = def.envName ? env[def.envName] : undefined
  if (def.envParse && raw !== undefined && String(raw).trim() !== "") {
    return { enabled: parseFeatureEnv(raw, def.envParse), source: "env" }
  }
  return { enabled: def.defaultOn, source: "default" }
}

/** Who may toggle: admin roles, or finance admin for finance switches. */
export function canToggleFeature(def: FeatureDefinition, roles: { admin: boolean; financeAdmin: boolean }): boolean {
  if (def.source === "vercel") return false
  return def.toggleRole === "finance_admin" ? roles.financeAdmin : roles.admin
}

/**
 * Env-only value (no database). For pure sync helpers whose callers pass the
 * live value in, and as their default in tests. Not for live gates.
 */
export function featureEnvValue(key: FeatureKey, env: Record<string, string | undefined> = process.env): boolean {
  const def = featureDefinition(key)
  if (!def) return false
  return resolveFeature(def, null, env).enabled
}

export type UnsavedFeatureSwitch = { key: FeatureKey; enabled: boolean; source: "env" | "default" }

/**
 * Page switches with no feature_switches row, so their live value still comes
 * from the old env var or the default (B7, G9). `rows` null (0111 not run)
 * means none is saved. "vercel" switches are never listed: they stay env only.
 * Saving each one at the value shown freezes today's behaviour in a row.
 */
export function unsavedFeatureSwitches(
  rows: ReadonlyMap<string, FeatureRow> | null,
  env: Record<string, string | undefined>,
): UnsavedFeatureSwitch[] {
  const out: UnsavedFeatureSwitch[] = []
  for (const def of FEATURE_DEFINITIONS as readonly FeatureDefinition[]) {
    if (def.source !== "switch" || rows?.has(def.key)) continue
    const r = resolveFeature(def, null, env)
    out.push({ key: def.key as FeatureKey, enabled: r.enabled, source: r.source === "env" ? "env" : "default" })
  }
  return out
}

/** POST /api/admin/features/save-current outside the production deployment (B7 review, finding 2). */
export const SAVE_CURRENT_NOT_PRODUCTION_MESSAGE =
  "Save current values only runs on the production site, because it saves this deployment's env var values for everyone. Open the production /admin/features and try there."
