"""
DealFlow AI — FastAPI Backend
M&A Target Analysis powered by Claude claude_sonnet_4_6
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from typing import Optional, List

import anthropic
import yfinance as yf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, validator

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="DealFlow AI", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Database ───────────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "database.sqlite")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name TEXT NOT NULL,
                industry TEXT NOT NULL,
                revenue TEXT NOT NULL,
                ebitda TEXT NOT NULL,
                growth_rate TEXT NOT NULL,
                debt_load TEXT NOT NULL,
                additional_context TEXT,
                sector_mode TEXT DEFAULT 'general',
                result TEXT,
                share_token TEXT,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name TEXT NOT NULL,
                industry TEXT NOT NULL,
                stage TEXT DEFAULT 'Screening',
                priority TEXT DEFAULT 'Medium',
                notes TEXT,
                analysis_id INTEGER,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        """)
        # Add share_token and sector_mode to existing DB if upgrading
        try:
            conn.execute("ALTER TABLE analyses ADD COLUMN share_token TEXT")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE analyses ADD COLUMN sector_mode TEXT DEFAULT 'general'")
        except Exception:
            pass
        conn.commit()

init_db()

# ── Anthropic Client ───────────────────────────────────────────────────────────
client = anthropic.Anthropic()

# ── Sector Mode Prompts ────────────────────────────────────────────────────────
SECTOR_PROMPTS = {
    "general": "",
    "saas": """
SECTOR CONTEXT — SaaS / Cloud Software:
Key metrics to weight heavily: ARR/MRR, net revenue retention (NRR), Rule of 40, CAC payback period, churn rate.
Typical deal multiples: 6x–15x ARR for high-growth SaaS, 4x–8x ARR for mature SaaS.
Strategic buyers: Salesforce, Oracle, SAP, ServiceNow, Thoma Bravo (PE), Vista Equity.
LBO lens: evaluate recurring revenue quality, EBITDA margins post cost-synergies, leverage capacity.
""",
    "healthcare": """
SECTOR CONTEXT — Healthcare / MedTech / Biopharma:
Key metrics: patient volume, reimbursement mix (commercial vs. Medicare/Medicaid), EBITDA margins, pipeline assets.
Typical deal multiples: 10x–18x EBITDA for healthcare services, pipeline-based for biopharma.
Strategic buyers: UnitedHealth/Optum, CVS Health, HCA Healthcare, Becton Dickinson, Stryker.
Regulatory risk: FDA approval timelines, CON requirements, HIPAA compliance must be flagged.
""",
    "industrials": """
SECTOR CONTEXT — Industrials / Manufacturing:
Key metrics: EBITDA margins, CapEx intensity, backlog/book-to-bill, customer concentration.
Typical deal multiples: 7x–12x EBITDA for diversified industrials.
Strategic buyers: Honeywell, Danaher, Parker Hannifin, AMETEK, Roper Technologies.
LBO lens: asset-heaviness affects leverage capacity; evaluate FCF conversion and CapEx requirements.
""",
    "fintech": """
SECTOR CONTEXT — FinTech / Financial Services:
Key metrics: total payment volume (TPV), take rate, net interest margin, deposits growth, regulatory capital.
Typical deal multiples: 15x–25x earnings for payments; 2x–4x book for banks.
Strategic buyers: Visa, Mastercard, FIS, Fiserv, JPMorgan, Stripe (private).
Regulatory risk: bank charter requirements, CFPB, OCC oversight must be flagged.
""",
    "consumer": """
SECTOR CONTEXT — Consumer / Retail / Brands:
Key metrics: same-store sales growth, gross margin, brand equity, DTC penetration, customer LTV.
Typical deal multiples: 10x–15x EBITDA for premium consumer brands; lower for mass market.
Strategic buyers: Procter & Gamble, Unilever, KKR (PE), Leonard Green (PE).
Key risks: inventory, tariffs, consumer sentiment, e-commerce disruption.
""",
    "energy": """
SECTOR CONTEXT — Energy / Utilities / Infrastructure:
Key metrics: proven reserves (for E&P), EBITDA/bbl, contracted revenue, rate base growth.
Typical deal multiples: 5x–9x EBITDA for midstream/utilities; EV/reserves for E&P.
Strategic buyers: ExxonMobil, Chevron, Brookfield, Blackstone Infrastructure.
ESG/regulatory risk: carbon transition, permitting delays must be flagged.
""",
}

# ── AI Prompt Builder ──────────────────────────────────────────────────────────
def build_prompt(data: dict, sector_mode: str = "general") -> str:
    sector_ctx = SECTOR_PROMPTS.get(sector_mode, "")
    additional = f"\nAdditional Context: {data.get('additionalContext')}" if data.get("additionalContext") else ""
    
    return f"""You are a senior investment banker at a bulge bracket firm (Goldman Sachs / Morgan Stanley level). Analyze the following company as a potential M&A target and return a structured JSON analysis.
{sector_ctx}
Company: {data['companyName']}
Industry: {data['industry']}
Revenue: ${data['revenue']}M (LTM)
EBITDA: ${data['ebitda']}M (LTM)
Revenue Growth Rate: {data['growthRate']}% YoY
Total Debt: ${data['debtLoad']}M
{additional}

Return ONLY valid JSON in this exact structure (no markdown, no extra text):
{{
  "fitScore": <integer 0-100>,
  "fitLabel": <"Strong Strategic Fit" | "Moderate Fit" | "Limited Fit" | "Poor Fit">,
  "acquirerType": <"Strategic" | "Financial Sponsor" | "Both">,
  "acquirerRationale": <1-2 sentence explanation of who would buy this and why, naming specific likely acquirers>,
  "evRange": {{
    "low": <number in millions>,
    "high": <number in millions>,
    "multiple": <"EV/EBITDA" | "EV/Revenue">,
    "multipleRange": <string like "8.0x–10.5x EV/EBITDA">
  }},
  "premiumRange": <string like "25%–40% premium to current trading">,
  "synergyPotential": <"High" | "Medium" | "Low">,
  "synergyDetails": <2-3 sentence breakdown of cost and revenue synergies with estimated dollar amounts>,
  "keyStrengths": [<3 specific, data-driven bullet points using finance terminology>],
  "keyRisks": [<3 specific bullet points referencing valuation, regulatory, or competitive risks>],
  "lboViability": <"Strong LBO Candidate" | "Moderate LBO Candidate" | "Weak LBO Candidate">,
  "lboRationale": <1-2 sentence LBO analysis referencing leverage capacity, FCF conversion, and implied IRR>,
  "dealbreakerFlags": [<list of any dealbreaker concerns, empty array if none>],
  "verdict": <2-3 sentence overall deal assessment from a senior banker's perspective, including recommendation>,
  "radarScores": {{
    "financial": <integer 0-100, financial health score>,
    "growth": <integer 0-100, growth trajectory score>,
    "synergy": <integer 0-100, synergy potential score>,
    "lbo": <integer 0-100, LBO attractiveness score>,
    "strategic": <integer 0-100, strategic fit score>,
    "risk": <integer 0-100, risk-adjusted score where 100 = lowest risk>
  }}
}}"""


# ── Pydantic Models ────────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    companyName: str
    industry: str
    revenue: str
    ebitda: str
    growthRate: str
    debtLoad: str
    additionalContext: Optional[str] = None
    sectorMode: Optional[str] = "general"

    @validator("companyName", "industry", "revenue", "ebitda", "growthRate", "debtLoad")
    def not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v


class WatchlistItem(BaseModel):
    company_name: str
    industry: str
    stage: Optional[str] = "Screening"
    priority: Optional[str] = "Medium"
    notes: Optional[str] = None
    analysis_id: Optional[int] = None


class WatchlistUpdate(BaseModel):
    stage: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None


# ── Helper ─────────────────────────────────────────────────────────────────────
def row_to_analysis(row) -> dict:
    d = dict(row)
    if d.get("result"):
        try:
            d["result"] = json.loads(d["result"])
        except Exception:
            d["result"] = None
    # Convert created_at unix ts to ms for frontend
    if d.get("created_at"):
        d["createdAt"] = d["created_at"] * 1000
    else:
        d["createdAt"] = None
    d["companyName"] = d.pop("company_name", d.get("companyName", ""))
    d["growthRate"] = d.pop("growth_rate", d.get("growthRate", ""))
    d["debtLoad"] = d.pop("debt_load", d.get("debtLoad", ""))
    d["additionalContext"] = d.pop("additional_context", d.get("additionalContext", ""))
    d["sectorMode"] = d.pop("sector_mode", d.get("sectorMode", "general"))
    d["shareToken"] = d.pop("share_token", d.get("shareToken", None))
    return d


def row_to_watchlist(row) -> dict:
    d = dict(row)
    if d.get("created_at"):
        d["createdAt"] = d["created_at"] * 1000
    d["companyName"] = d.pop("company_name", "")
    d["analysisId"] = d.pop("analysis_id", None)
    return d


# ── Routes: Analysis ───────────────────────────────────────────────────────────
@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    data = req.dict()
    sector_mode = data.get("sectorMode") or "general"

    # Insert pending record
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO analyses 
               (company_name, industry, revenue, ebitda, growth_rate, debt_load, additional_context, sector_mode)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (req.companyName, req.industry, req.revenue, req.ebitda,
             req.growthRate, req.debtLoad, req.additionalContext, sector_mode),
        )
        analysis_id = cursor.lastrowid
        conn.commit()

    # Call Claude
    prompt = build_prompt(data, sector_mode)
    try:
        message = client.messages.create(
            model="claude_sonnet_4_6",
            max_tokens=1800,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = message.content[0].text if message.content else ""

        # Parse JSON
        try:
            result_json = json.loads(raw_text)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                result_json = json.loads(match.group(0))
            else:
                raise HTTPException(status_code=500, detail="Could not parse AI response")

        # Generate share token
        import secrets
        share_token = secrets.token_urlsafe(8)

        # Update record with result
        with get_db() as conn:
            conn.execute(
                "UPDATE analyses SET result=?, share_token=? WHERE id=?",
                (json.dumps(result_json), share_token, analysis_id),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM analyses WHERE id=?", (analysis_id,)).fetchone()

        return {"id": analysis_id, "result": result_json, "analysis": row_to_analysis(row), "shareToken": share_token}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/analyses")
def get_analyses():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM analyses ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    return [row_to_analysis(r) for r in rows]


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM analyses WHERE id=?", (analysis_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return row_to_analysis(row)


@app.get("/api/share/{token}")
def get_shared_analysis(token: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM analyses WHERE share_token=?", (token,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Shared analysis not found")
    return row_to_analysis(row)


@app.get("/api/analyses/{analysis_id}/pdf")
async def export_pdf(analysis_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM analyses WHERE id=?", (analysis_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    analysis = row_to_analysis(row)
    if not analysis.get("result"):
        raise HTTPException(status_code=400, detail="Analysis not complete")

    payload = json.dumps(analysis)
    script_path = os.path.join(os.path.dirname(__file__), "pdf_export.py")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            [sys.executable, script_path, payload, tmp_path],
            timeout=30,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {result.stderr}")

        safe_name = re.sub(r"[^a-z0-9]", "-", analysis["companyName"].lower())
        return FileResponse(
            tmp_path,
            media_type="application/pdf",
            filename=f"dealflow-{safe_name}.pdf",
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="PDF generation timed out")


# ── Routes: Market Data ────────────────────────────────────────────────────────
@app.get("/api/market/{ticker}")
async def get_market_data(ticker: str):
    """Fetch live market data for a public company ticker via yfinance."""
    try:
        t = ticker.upper().strip()
        stock = yf.Ticker(t)
        info = stock.info

        if not info or "symbol" not in info:
            raise HTTPException(status_code=404, detail=f"Ticker {t} not found")

        # Pull key financial metrics
        market_cap = info.get("marketCap", 0)
        enterprise_value = info.get("enterpriseValue", 0)
        revenue = info.get("totalRevenue", 0)
        ebitda = info.get("ebitda", 0)
        ev_ebitda = info.get("enterpriseToEbitda", None)
        ev_revenue = info.get("enterpriseToRevenue", None)
        pe_ratio = info.get("trailingPE", None)
        revenue_growth = info.get("revenueGrowth", None)
        gross_margins = info.get("grossMargins", None)
        ebitda_margins = info.get("ebitdaMargins", None)
        current_price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        
        # 52w data
        week_52_low = info.get("fiftyTwoWeekLow", None)
        week_52_high = info.get("fiftyTwoWeekHigh", None)
        
        return {
            "ticker": t,
            "name": info.get("longName") or info.get("shortName", t),
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "currentPrice": current_price,
            "marketCap": market_cap,
            "enterpriseValue": enterprise_value,
            "revenue": revenue / 1e6 if revenue else None,  # in $M
            "ebitda": ebitda / 1e6 if ebitda else None,       # in $M
            "evEbitda": round(ev_ebitda, 1) if ev_ebitda else None,
            "evRevenue": round(ev_revenue, 2) if ev_revenue else None,
            "peRatio": round(pe_ratio, 1) if pe_ratio else None,
            "revenueGrowth": round(revenue_growth * 100, 1) if revenue_growth else None,
            "grossMargins": round(gross_margins * 100, 1) if gross_margins else None,
            "ebitdaMargins": round(ebitda_margins * 100, 1) if ebitda_margins else None,
            "week52Low": week_52_low,
            "week52High": week_52_high,
            "currency": info.get("currency", "USD"),
            "exchange": info.get("exchange", ""),
            "description": (info.get("longBusinessSummary") or "")[:300],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Market data fetch failed: {str(e)}")


# ── Routes: Watchlist / Pipeline ───────────────────────────────────────────────
@app.get("/api/watchlist")
def get_watchlist():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM watchlist ORDER BY created_at DESC"
        ).fetchall()
    return [row_to_watchlist(r) for r in rows]


@app.post("/api/watchlist")
def add_to_watchlist(item: WatchlistItem):
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO watchlist (company_name, industry, stage, priority, notes, analysis_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (item.company_name, item.industry, item.stage, item.priority, item.notes, item.analysis_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM watchlist WHERE id=?", (cursor.lastrowid,)).fetchone()
    return row_to_watchlist(row)


@app.patch("/api/watchlist/{item_id}")
def update_watchlist_item(item_id: int, update: WatchlistUpdate):
    fields = {k: v for k, v in update.dict().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k}=?" for k in fields.keys())
    values = list(fields.values()) + [item_id]

    with get_db() as conn:
        conn.execute(f"UPDATE watchlist SET {set_clause} WHERE id=?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM watchlist WHERE id=?", (item_id,)).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row_to_watchlist(row)


@app.delete("/api/watchlist/{item_id}")
def delete_watchlist_item(item_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM watchlist WHERE id=?", (item_id,))
        conn.commit()
    return {"success": True}


# ── Static Files (production) ──────────────────────────────────────────────────
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "dist", "public")
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index = os.path.join(STATIC_DIR, "index.html")
        return FileResponse(index)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
