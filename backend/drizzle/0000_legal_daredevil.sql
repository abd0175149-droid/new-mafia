DO $$ BEGIN
 CREATE TYPE "public"."activity_status" AS ENUM('planned', 'active', 'completed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."cost_type" AS ENUM('activity', 'general');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_type" AS ENUM('new_booking', 'upcoming_activity', 'cost_alert', 'financial', 'new_location', 'new_activity', 'foundational_cost', 'game_started', 'game_ended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."staff_role" AS ENUM('admin', 'manager', 'leader', 'location_owner');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."gender_type" AS ENUM('male', 'female');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."winner_type" AS ENUM('MAFIA', 'CITIZEN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"date" timestamp NOT NULL,
	"description" text DEFAULT '',
	"base_price" numeric(10, 2) DEFAULT '0',
	"status" "activity_status" DEFAULT 'planned' NOT NULL,
	"location_id" integer,
	"drive_link" text DEFAULT '',
	"enabled_offer_ids" jsonb DEFAULT '[]'::jsonb,
	"is_locked" boolean DEFAULT false,
	"max_capacity" integer DEFAULT 20,
	"difficulty" varchar(20) DEFAULT 'medium',
	"session_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(50),
	"entity" varchar(50),
	"entity_id" varchar(50),
	"details" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(20) DEFAULT '',
	"count" integer DEFAULT 1,
	"is_paid" boolean DEFAULT false,
	"paid_amount" numeric(10, 2) DEFAULT '0',
	"received_by" varchar(100) DEFAULT '',
	"is_free" boolean DEFAULT false,
	"notes" text DEFAULT '',
	"offer_items" jsonb DEFAULT '[]'::jsonb,
	"created_by" varchar(100) DEFAULT '',
	"player_id" integer,
	"checked_in" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer,
	"item" varchar(200) NOT NULL,
	"amount" numeric(10, 2) DEFAULT '0',
	"date" timestamp NOT NULL,
	"paid_by" varchar(100) DEFAULT '',
	"type" "cost_type" DEFAULT 'general' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "foundational_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"item" varchar(200) NOT NULL,
	"amount" numeric(10, 2) DEFAULT '0',
	"paid_by" varchar(100) DEFAULT '',
	"source" varchar(100) DEFAULT '',
	"date" timestamp NOT NULL,
	"is_processed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"map_url" text DEFAULT '',
	"offers" jsonb DEFAULT '[]'::jsonb,
	"is_test_location" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"title" varchar(200) NOT NULL,
	"message" text DEFAULT '',
	"type" "notification_type" NOT NULL,
	"read" boolean DEFAULT false,
	"target_id" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"role" "staff_role" DEFAULT 'manager' NOT NULL,
	"photo_url" text,
	"permissions" jsonb DEFAULT '["activities","bookings","finances","locations"]'::jsonb,
	"last_login" timestamp,
	"is_partner" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"location_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"new_booking" boolean DEFAULT true,
	"upcoming_activity" boolean DEFAULT true,
	"cost_alert" boolean DEFAULT true,
	"dashboard_layout" jsonb DEFAULT '["revenue","costs","profit","bookings","upcoming"]'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"session_player_id" integer,
	"player_id" integer,
	"physical_id" integer NOT NULL,
	"player_name" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"survived_to_end" boolean DEFAULT false,
	"eliminated_at_round" integer,
	"eliminated_during" varchar(20),
	"rounds_survived" integer DEFAULT 0,
	"deal_initiated" boolean DEFAULT false,
	"deal_success" boolean,
	"ability_used" boolean DEFAULT false,
	"ability_correct" boolean,
	"xp_earned" integer DEFAULT 0,
	"rr_change" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"room_id" varchar(50) NOT NULL,
	"room_code" varchar(6) NOT NULL,
	"game_name" varchar(100) NOT NULL,
	"leader_staff_id" integer,
	"display_pin" varchar(6),
	"player_count" integer NOT NULL,
	"max_players" integer DEFAULT 10,
	"is_active" boolean DEFAULT true,
	"winner" "winner_type",
	"total_rounds" integer DEFAULT 0,
	"duration_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"player_id" integer,
	"physical_id" integer NOT NULL,
	"player_name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"gender" varchar(10) DEFAULT 'MALE',
	"date_of_birth" date,
	"booking_id" integer,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_code" varchar(6) NOT NULL,
	"display_pin" varchar(6),
	"session_name" varchar(100) NOT NULL,
	"max_players" integer DEFAULT 10,
	"is_active" boolean DEFAULT true,
	"status" varchar(20) DEFAULT 'active',
	"created_by" integer,
	"activity_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"voter_session_player_id" integer,
	"best_player_session_player_id" integer,
	"leader_rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activities" ADD CONSTRAINT "activities_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "costs" ADD CONSTRAINT "costs_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_staff_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff" ADD CONSTRAINT "staff_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_staff_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_players" ADD CONSTRAINT "match_players_session_player_id_session_players_id_fk" FOREIGN KEY ("session_player_id") REFERENCES "public"."session_players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_players" ADD CONSTRAINT "session_players_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surveys" ADD CONSTRAINT "surveys_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surveys" ADD CONSTRAINT "surveys_voter_session_player_id_session_players_id_fk" FOREIGN KEY ("voter_session_player_id") REFERENCES "public"."session_players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "surveys" ADD CONSTRAINT "surveys_best_player_session_player_id_session_players_id_fk" FOREIGN KEY ("best_player_session_player_id") REFERENCES "public"."session_players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
