import { db } from "./db";
import { settings, type Settings, type InsertSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getSettings(userId: string): Promise<Settings | undefined>;
  updateSettings(userId: string, update: Partial<InsertSettings>): Promise<Settings>;
}

export class DatabaseStorage implements IStorage {
  async getSettings(userId: string): Promise<Settings | undefined> {
    const [result] = await db.select().from(settings).where(eq(settings.userId, userId));
    return result;
  }

  async updateSettings(userId: string, update: Partial<InsertSettings>): Promise<Settings> {
    const existing = await this.getSettings(userId);
    if (!existing) {
      const [inserted] = await db.insert(settings).values({ userId, ...update }).returning();
      return inserted;
    }
    const [updated] = await db.update(settings).set(update).where(eq(settings.userId, userId)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();