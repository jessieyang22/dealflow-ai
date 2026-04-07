import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { analyses, type Analysis, type InsertAnalysis } from "@shared/schema";
import { desc } from "drizzle-orm";

const sqlite = new Database("database.sqlite");
export const db = drizzle(sqlite);

// Create table if not exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    industry TEXT NOT NULL,
    revenue TEXT NOT NULL,
    ebitda TEXT NOT NULL,
    growth_rate TEXT NOT NULL,
    debt_load TEXT NOT NULL,
    additional_context TEXT,
    result TEXT,
    created_at INTEGER
  )
`);

export interface IStorage {
  createAnalysis(data: InsertAnalysis): Analysis;
  updateAnalysisResult(id: number, result: string): Analysis | undefined;
  getRecentAnalyses(limit?: number): Analysis[];
  getAnalysisById(id: number): Analysis | undefined;
}

export class DatabaseStorage implements IStorage {
  createAnalysis(data: InsertAnalysis): Analysis {
    const now = new Date();
    return db
      .insert(analyses)
      .values({ ...data, createdAt: now })
      .returning()
      .get();
  }

  updateAnalysisResult(id: number, result: string): Analysis | undefined {
    return db
      .update(analyses)
      .set({ result })
      .where(eq(analyses.id, id))
      .returning()
      .get();
  }

  getRecentAnalyses(limit = 10): Analysis[] {
    return db
      .select()
      .from(analyses)
      .orderBy(desc(analyses.createdAt))
      .limit(limit)
      .all();
  }

  getAnalysisById(id: number): Analysis | undefined {
    return db.select().from(analyses).where(eq(analyses.id, id)).get();
  }
}

import { eq } from "drizzle-orm";
export const storage = new DatabaseStorage();
