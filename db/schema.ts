import {
  bigserial,
  customType,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const narrations = pgTable(
  "narrations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    script: text("script").notNull(),
    voiceId: varchar("voice_id", { length: 100 }).notNull(),
    voiceName: varchar("voice_name", { length: 100 }).notNull(),
    gender: varchar("gender", { length: 10 }).notNull(),
    audio: bytea("audio"),
    audioUrl: varchar("audio_url", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("narrations_created_at_idx").on(table.createdAt)],
);

export type Narration = typeof narrations.$inferSelect;
export type NewNarration = typeof narrations.$inferInsert;