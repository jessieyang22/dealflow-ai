import type { Express } from "express";
import type { Server } from "http";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";
import { insertAnalysisSchema } from "@shared/schema";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

const client = new Anthropic();

function buildPrompt(data: {
  companyName: string;
  industry: string;
  revenue: string;
  ebitda: string;
  growthRate: string;
  debtLoad: string;
  additionalContext?: string | null;
}): string {
  return `You are a senior investment banker at a bulge bracket firm. Analyze the following company as a potential M&A target and return a structured JSON analysis.

Company: ${data.companyName}
Industry: ${data.industry}
Revenue: $${data.revenue}M (LTM)
EBITDA: $${data.ebitda}M (LTM)
Revenue Growth Rate: ${data.growthRate}% YoY
Debt Load: $${data.debtLoad}M
${data.additionalContext ? `Additional Context: ${data.additionalContext}` : ""}

Return ONLY valid JSON in this exact structure (no markdown, no extra text):
{
  "fitScore": <integer 0-100>,
  "fitLabel": <"Strong Strategic Fit" | "Moderate Fit" | "Limited Fit" | "Poor Fit">,
  "acquirerType": <"Strategic" | "Financial Sponsor" | "Both">,
  "acquirerRationale": <1-2 sentence explanation of who would buy this and why>,
  "evRange": {
    "low": <number in millions>,
    "high": <number in millions>,
    "multiple": <"EV/EBITDA" | "EV/Revenue">,
    "multipleRange": <string like "8.0x–10.5x EV/EBITDA">
  },
  "premiumRange": <string like "25%–40% premium to current trading">,
  "synergyPotential": <"High" | "Medium" | "Low">,
  "synergyDetails": <2-3 sentence breakdown of cost and revenue synergies>,
  "keyStrengths": [<3 specific bullet points>],
  "keyRisks": [<3 specific bullet points>],
  "lboViability": <"Strong LBO Candidate" | "Moderate LBO Candidate" | "Weak LBO Candidate">,
  "lboRationale": <1-2 sentence LBO analysis referencing leverage capacity and cash flow>,
  "dealbreakerFlags": [<list of any dealbreaker concerns, empty array if none>],
  "verdict": <2-3 sentence overall deal assessment from a banker's perspective>
}`;
}

export function registerRoutes(server: Server, app: Express) {
  // Submit company for analysis
  app.post("/api/analyze", async (req, res) => {
    const parsed = insertAnalysisSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    }

    // Create record first
    const analysis = storage.createAnalysis(parsed.data);

    try {
      const prompt = buildPrompt(parsed.data);
      const message = await client.messages.create({
        model: "claude_sonnet_4_6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const rawText = message.content[0].type === "text" ? message.content[0].text : "";
      
      // Parse and validate JSON
      let resultJson: Record<string, unknown>;
      try {
        resultJson = JSON.parse(rawText);
      } catch {
        // Try to extract JSON from text
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          resultJson = JSON.parse(match[0]);
        } else {
          throw new Error("Could not parse AI response as JSON");
        }
      }

      const updated = storage.updateAnalysisResult(analysis.id, JSON.stringify(resultJson));
      res.json({ id: analysis.id, result: resultJson, analysis: updated });
    } catch (err) {
      console.error("Analysis error:", err);
      res.status(500).json({ error: "Analysis failed. Please try again." });
    }
  });

  // Get recent analyses
  app.get("/api/analyses", (_req, res) => {
    const recent = storage.getRecentAnalyses(20);
    res.json(recent.map(a => ({
      ...a,
      result: a.result ? JSON.parse(a.result) : null,
    })));
  });

  // Export analysis as PDF
  app.get("/api/analyses/:id/pdf", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const analysis = storage.getAnalysisById(id);
    if (!analysis) return res.status(404).json({ error: "Not found" });
    if (!analysis.result) return res.status(400).json({ error: "Analysis not complete" });

    const payload = JSON.stringify({
      ...analysis,
      result: JSON.parse(analysis.result),
    });

    const tmpPath = path.join(os.tmpdir(), `dealflow-${id}-${Date.now()}.pdf`);
    const scriptPath = path.join(__dirname, "..", "server", "pdf_export.py");

    try {
      await execFileAsync("python3", [scriptPath, payload, tmpPath], {
        timeout: 30000,
      });

      const pdfBuffer = fs.readFileSync(tmpPath);
      const safeName = (analysis.companyName || "deal-assessment")
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="dealflow-${safeName}.pdf"`);
      res.send(pdfBuffer);
      fs.unlinkSync(tmpPath);
    } catch (err) {
      console.error("PDF export error:", err);
      res.status(500).json({ error: "PDF generation failed" });
    }
  });

  // Get single analysis
  app.get("/api/analyses/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const analysis = storage.getAnalysisById(id);
    if (!analysis) return res.status(404).json({ error: "Not found" });
    res.json({
      ...analysis,
      result: analysis.result ? JSON.parse(analysis.result) : null,
    });
  });
}
