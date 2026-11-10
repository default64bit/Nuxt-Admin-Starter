CREATE TYPE "public"."demo_ticket_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."demo_ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "demo_tickets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "demo_ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "demo_ticket_priority" DEFAULT 'normal' NOT NULL,
	"assignee_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_tickets_title_length" CHECK (char_length(btrim("demo_tickets"."title")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_tickets_created_idx" ON "demo_tickets" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "demo_tickets_status_created_idx" ON "demo_tickets" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "demo_tickets_assignee_idx" ON "demo_tickets" USING btree ("assignee_id");