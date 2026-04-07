import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull(),
  industry: text("industry").notNull(),
  revenue: text("revenue").notNull(),
  ebitda: text("ebitda").notNull(),
  growthRate: text("growth_rate").notNull(),
  debtLoad: text("debt_load").notNull(),
  additionalContext: text("additional_context"),
  result: text("result"), // JSON stringified analysis result
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const insertAnalysisSchema = createInsertSchema(analyses).omit({
  id: true,
  result: true,
  createdAt: true,
});

export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analyses.$inferSelect;
