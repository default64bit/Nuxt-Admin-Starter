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
	"image_media_object_id" uuid,
	"image_alt_fa" text,
	"image_alt_en" text,
	CONSTRAINT "demo_tickets_title_length" CHECK (char_length(btrim("demo_tickets"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "demo_tickets_image_requires_alt" CHECK ("demo_tickets"."image_media_object_id" IS NULL OR (btrim(coalesce("demo_tickets"."image_alt_fa", '')) <> '' AND btrim(coalesce("demo_tickets"."image_alt_en", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_image_media_object_id_media_objects_id_fk" FOREIGN KEY ("image_media_object_id") REFERENCES "public"."media_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_tickets_created_idx" ON "demo_tickets" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "demo_tickets_status_created_idx" ON "demo_tickets" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "demo_tickets_assignee_idx" ON "demo_tickets" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "demo_tickets_image_idx" ON "demo_tickets" USING btree ("image_media_object_id");