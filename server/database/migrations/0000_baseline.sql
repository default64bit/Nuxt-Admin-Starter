CREATE TYPE "public"."audit_outcome" AS ENUM('success', 'denied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('fa', 'en');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('telegram', 'push');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'phone_change');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('queued', 'claimed', 'delivered', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"outcome" "audit_outcome" NOT NULL,
	"change_summary" jsonb,
	"reason" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_events_action_not_blank" CHECK (btrim("admin_audit_events"."action") <> '')
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"user_agent" text,
	CONSTRAINT "auth_sessions_expiry_order" CHECK ("auth_sessions"."absolute_expires_at" > "auth_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"phone_e164" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"user_id" uuid,
	"code" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	CONSTRAINT "otp_challenges_phone_format" CHECK ("otp_challenges"."phone_e164" ~ '^\+989[0-9]{9}$'),
	CONSTRAINT "otp_challenges_code_format" CHECK ("otp_challenges"."code" IS NULL OR "otp_challenges"."code" ~ '^[0-9]{5}$'),
	CONSTRAINT "otp_challenges_code_cleared_when_closed" CHECK (("otp_challenges"."consumed_at" IS NULL AND "otp_challenges"."invalidated_at" IS NULL) OR "otp_challenges"."code" IS NULL),
	CONSTRAINT "otp_challenges_attempts_range" CHECK ("otp_challenges"."attempt_count" BETWEEN 0 AND 10),
	CONSTRAINT "otp_challenges_expiry_order" CHECK ("otp_challenges"."expires_at" > "otp_challenges"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "otp_send_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"phone_e164" text NOT NULL,
	"ip_hash" text NOT NULL,
	"user_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"is_super" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"phone_e164" text NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"given_name" text,
	"family_name" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"is_default_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_e164_format" CHECK ("users"."phone_e164" ~ '^\+989[0-9]{9}$'),
	CONSTRAINT "users_default_admin_never_disabled" CHECK (NOT ("users"."is_default_admin" AND "users"."status" = 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "seed_versions" (
	"version" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"arrangement" jsonb,
	"ranges" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"chart_style" text DEFAULT 'soft' NOT NULL,
	"arrangement_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_preferences_chart_style" CHECK ("dashboard_preferences"."chart_style" IN ('soft', 'glow', 'pro'))
);
--> statement-breakpoint
CREATE TABLE "notification_channel_health" (
	"channel" "notification_channel" PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'operational' NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_failure_category" text,
	"next_probe_at" timestamp with time zone,
	CONSTRAINT "notification_channel_health_status" CHECK ("notification_channel_health"."status" IN ('operational', 'degraded')),
	CONSTRAINT "notification_channel_health_failures_nonnegative" CHECK ("notification_channel_health"."consecutive_failures" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notification_channel_preferences" (
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_channel_preferences_user_id_channel_pk" PRIMARY KEY("user_id","channel")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"dedupe_key" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"event_key" text NOT NULL,
	"locale" "locale",
	"recipient" text,
	"tokens" text[],
	"source_entity_type" text NOT NULL,
	"source_entity_id" text NOT NULL,
	"notification_id" uuid,
	"status" "outbox_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"leased_by" text,
	"recipient_user_id" uuid,
	"delivered_at" timestamp with time zone,
	"terminal_failed_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"last_failure_category" text,
	"payload_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_attempts_range" CHECK ("notification_outbox"."attempt_count" BETWEEN 0 AND 5),
	CONSTRAINT "notification_outbox_token_limit" CHECK ("notification_outbox"."tokens" IS NULL OR cardinality("notification_outbox"."tokens") <= 3),
	CONSTRAINT "notification_outbox_status_timestamps" CHECK (("notification_outbox"."status" = 'delivered') = ("notification_outbox"."delivered_at" IS NOT NULL)
        AND ("notification_outbox"."status" = 'failed') = ("notification_outbox"."terminal_failed_at" IS NOT NULL)
        AND ("notification_outbox"."status" = 'skipped') = ("notification_outbox"."skipped_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_notification_id_user_id_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"message_locale" "locale" DEFAULT 'fa' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"type" text NOT NULL,
	"required_permission" text NOT NULL,
	"recipient_user_id" uuid,
	"source_entity_type" text NOT NULL,
	"source_entity_id" text NOT NULL,
	"tokens" text[],
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "notifications_token_limit" CHECK ("notifications"."tokens" IS NULL OR cardinality("notifications"."tokens") <= 3)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"locale_scope" "locale" NOT NULL,
	"device_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_send_events" ADD CONSTRAINT "otp_send_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channel_preferences" ADD CONSTRAINT "notification_channel_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_required_permission_permissions_key_fk" FOREIGN KEY ("required_permission") REFERENCES "public"."permissions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_events_time_idx" ON "admin_audit_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_events_entity_idx" ON "admin_audit_events" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_events_actor_idx" ON "admin_audit_events" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "otp_challenges_one_active_unique" ON "otp_challenges" USING btree ("phone_e164","purpose") WHERE "otp_challenges"."consumed_at" IS NULL AND "otp_challenges"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX "otp_send_events_phone_sent_idx" ON "otp_send_events" USING btree ("phone_e164","sent_at");--> statement-breakpoint
CREATE INDEX "otp_send_events_ip_sent_idx" ON "otp_send_events" USING btree ("ip_hash","sent_at");--> statement-breakpoint
CREATE INDEX "otp_send_events_user_sent_idx" ON "otp_send_events" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_unique" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_normalized_unique" ON "roles" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "roles_single_super_unique" ON "roles" USING btree ("is_super") WHERE "roles"."is_super";--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_e164_unique" ON "users" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_default_admin_unique" ON "users" USING btree ("is_default_admin") WHERE "users"."is_default_admin";--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_key_unique" ON "notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_due_idx" ON "notification_outbox" USING btree ("next_attempt_at") WHERE "notification_outbox"."status" IN ('queued', 'claimed');--> statement-breakpoint
CREATE INDEX "notification_outbox_retention_idx" ON "notification_outbox" USING btree ("status","delivered_at","terminal_failed_at","skipped_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_recipient_user_idx" ON "notification_outbox" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key_unique" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_unresolved_idx" ON "notifications" USING btree ("required_permission","created_at" DESC NULLS LAST) WHERE "notifications"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_source_idx" ON "notifications" USING btree ("source_entity_type","source_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
-- hand-written-sql:start
-- Drizzle cannot generate triggers or functions. After regenerating this baseline from the schema, re-append this
-- whole block (everything from the `hand-written-sql:start` line to the `hand-written-sql:end` line).

-- 1. The `super` Role is protected in the database as well as in the service: it cannot be deleted, renamed or
-- unflagged, and none of its Permission rows can be deleted or changed. Inserting rows stays allowed, so the seed
-- can grant newly added keys to it.
CREATE FUNCTION protect_super_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'roles' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.is_super THEN
        RAISE EXCEPTION 'the super role cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
      END IF;
      RETURN OLD;
    END IF;
    IF OLD.is_super AND (NEW.name IS DISTINCT FROM OLD.name OR NEW.is_super IS DISTINCT FROM OLD.is_super) THEN
      RAISE EXCEPTION 'the super role cannot be renamed or changed' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- role_permissions
  IF EXISTS (SELECT 1 FROM roles WHERE id = OLD.role_id AND is_super) THEN
    RAISE EXCEPTION 'permissions of the super role cannot be removed or changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER roles_protect_super
  BEFORE UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION protect_super_role();
--> statement-breakpoint
CREATE TRIGGER role_permissions_protect_super
  BEFORE UPDATE OR DELETE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION protect_super_role();
--> statement-breakpoint

-- 2. The audit log is append-only: no audit event is ever changed, removed or truncated away.
CREATE FUNCTION reject_row_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER admin_audit_events_append_only
  BEFORE UPDATE OR DELETE ON admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_row_mutation();
--> statement-breakpoint
CREATE TRIGGER admin_audit_events_no_truncate
  BEFORE TRUNCATE ON admin_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_row_mutation();
-- hand-written-sql:end
