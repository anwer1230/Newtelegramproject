import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Database schema for saving user settings
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  message: text("message").default(""),
  groups: text("groups").array().default([]),
  intervalSeconds: integer("interval_seconds").default(3600),
  watchWords: text("watch_words").array().default([]),
  sendType: text("send_type").default("manual"),
  scheduledTime: text("scheduled_time").default(""),
  loopIntervalSeconds: integer("loop_interval_seconds").default(0), // New field for loop delay
});

export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
