CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'phone_change');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
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
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_send_events" ADD CONSTRAINT "otp_send_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
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
CREATE UNIQUE INDEX "users_single_default_admin_unique" ON "users" USING btree ("is_default_admin") WHERE "users"."is_default_admin";
--> statement-breakpoint
-- Hand-written (Drizzle cannot generate triggers). The `super` Role is protected in the database as well as in the
-- service: it cannot be deleted, renamed or unflagged, and none of its Permission rows can be deleted or changed.
-- Inserting rows stays allowed, so the seed can grant newly added keys to it.
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
