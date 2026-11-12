CREATE TABLE "codex_board_configs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codex_board_configs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"scope" text NOT NULL,
	"owner_email" text,
	"group_by" text NOT NULL,
	"swimlane_by" text,
	"card_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hide_completed" boolean DEFAULT true NOT NULL,
	"wip_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codex_custom_fields" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codex_custom_fields_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" bigint,
	"name" text NOT NULL,
	"field_type" text NOT NULL,
	"options" jsonb,
	"done_option" text
);
--> statement-breakpoint
CREATE TABLE "codex_notification_prefs" (
	"email" text PRIMARY KEY NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quiet_start" time DEFAULT '18:00',
	"quiet_end" time DEFAULT '08:00'
);
--> statement-breakpoint
CREATE TABLE "codex_notifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codex_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"recipient_email" text NOT NULL,
	"kind" text NOT NULL,
	"task_id" bigint,
	"actor_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"teams_sent_at" timestamp with time zone,
	"email_digest_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "codex_project_members" (
	"project_id" bigint NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "codex_project_members_project_id_email_pk" PRIMARY KEY("project_id","email")
);
--> statement-breakpoint
CREATE TABLE "codex_projects" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codex_projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"client_id" bigint,
	"mba_number" text,
	"name" text NOT NULL,
	"owner_email" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"progress_field_id" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"start_on" date,
	"due_on" date,
	"teams_channel_id" text,
	"created_by_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "codex_sections" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codex_sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" bigint NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"collapsed_default" boolean DEFAULT false NOT NULL,
	"status_category" text DEFAULT 'todo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codex_user_prefs" (
	"email" text PRIMARY KEY NOT NULL,
	"default_lens" text DEFAULT 'plan' NOT NULL,
	"calendar_feed_token_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "task_attachments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"task_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"blob_pathname" text,
	"url" text,
	"size_bytes" bigint,
	"uploaded_by_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_followers" (
	"task_id" bigint NOT NULL,
	"email" text NOT NULL,
	"reason" text,
	CONSTRAINT "task_followers_task_id_email_pk" PRIMARY KEY("task_id","email")
);
--> statement-breakpoint
ALTER TABLE "codex_custom_fields" ADD CONSTRAINT "codex_custom_fields_project_id_codex_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."codex_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_notifications" ADD CONSTRAINT "codex_notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_project_members" ADD CONSTRAINT "codex_project_members_project_id_codex_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."codex_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_projects" ADD CONSTRAINT "codex_projects_progress_field_id_fkey" FOREIGN KEY ("progress_field_id") REFERENCES "public"."codex_custom_fields"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codex_sections" ADD CONSTRAINT "codex_sections_project_id_codex_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."codex_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_followers" ADD CONSTRAINT "task_followers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_codex_board_configs_scope_owner" ON "codex_board_configs" USING btree ("scope","owner_email");--> statement-breakpoint
CREATE INDEX "idx_codex_custom_fields_project" ON "codex_custom_fields" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_codex_notifications_recipient_read" ON "codex_notifications" USING btree ("recipient_email","read_at");--> statement-breakpoint
CREATE INDEX "idx_codex_notifications_task_id" ON "codex_notifications" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_codex_project_members_email" ON "codex_project_members" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_codex_projects_mba" ON "codex_projects" USING btree ("mba_number") WHERE "codex_projects"."mba_number" IS NOT NULL AND "codex_projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_codex_sections_project_sort" ON "codex_sections" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_task_attachments_task_id" ON "task_attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_followers_email" ON "task_followers" USING btree ("email");