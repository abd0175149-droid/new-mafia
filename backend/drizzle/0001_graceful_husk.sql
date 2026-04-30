CREATE TABLE IF NOT EXISTS "booking_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(20),
	"is_guest" boolean DEFAULT false,
	"checked_in" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_follows" (
	"id" serial PRIMARY KEY NOT NULL,
	"follower_id" integer NOT NULL,
	"following_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(20) NOT NULL,
	"password_hash" varchar(255),
	"must_change_password" boolean DEFAULT false,
	"name" varchar(100) NOT NULL,
	"gender" varchar(10) DEFAULT 'MALE',
	"dob" varchar(20),
	"email" varchar(200),
	"avatar_url" text,
	"total_matches" integer DEFAULT 0,
	"total_wins" integer DEFAULT 0,
	"total_survived" integer DEFAULT 0,
	"xp" integer DEFAULT 0,
	"level" integer DEFAULT 1,
	"rank_tier" varchar(20) DEFAULT 'INFORMANT',
	"rank_rr" integer DEFAULT 0,
	"total_deals" integer DEFAULT 0,
	"successful_deals" integer DEFAULT 0,
	"last_active_at" timestamp,
	"is_test_account" boolean DEFAULT false,
	"welcome_bonus_applied" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "players_phone_unique" UNIQUE("phone")
);
