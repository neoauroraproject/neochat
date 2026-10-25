CREATE TABLE IF NOT EXISTS "call_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chat_id" uuid NOT NULL,
  "room_name" text NOT NULL,
  "initiated_by" uuid NOT NULL,
  "video" boolean DEFAULT false NOT NULL,
  "screen_share_enabled" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'ringing' NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "call_session_id" uuid NOT NULL,
  "chat_id" uuid NOT NULL,
  "room_name" text NOT NULL,
  "initiated_by" uuid NOT NULL,
  "video" boolean NOT NULL,
  "screen_share_enabled" boolean DEFAULT false NOT NULL,
  "duration_seconds" integer,
  "participants" jsonb NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_call_session_id_call_sessions_id_fk" FOREIGN KEY ("call_session_id") REFERENCES "public"."call_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
