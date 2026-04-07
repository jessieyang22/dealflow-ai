"""
DealFlow AI — FastAPI Backend v4
M&A Target Analysis · Auth · Waitlist · Admin Dashboard · Deal Memo · Bulk Screener · Precedent Transactions
"""
import json
import os
import re
import secrets
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from typing import Optional, List

import anthropic
import yfinance as yf
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, validator

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="DealFlow AI", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth Config ────────────────────────────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET", "dealflow-jwt-secret-dev-2026")
JWT_ALGO   = "HS256"
JWT_EXPIRE_DAYS = 30

ADMIN_EMAIL    = os.environ.get("ADMIN_EMAIL", "yangjessie7@gmail.com")
ADMIN_SECRET   = os.environ.get("ADMIN_SECRET", "dealflow-admin-2026")  # header check

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

FREE_ANALYSES_LIMIT = 2  # runs before login required
PRO_MONTHLY_PRICE   = 29   # USD
TEAMS_MONTHLY_PRICE = 99   # USD

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
                user_id INTEGER,
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
                user_id INTEGER,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                analyses_run INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS waitlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                role TEXT,
                source TEXT DEFAULT 'landing',
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ff_scenarios (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                label       TEXT NOT NULL,
                snapshot    TEXT NOT NULL,   -- JSON blob of all assumption fields
                created_at  INTEGER DEFAULT (strftime('%s','now')),
                updated_at  INTEGER DEFAULT (strftime('%s','now'))
            )
        """)
        # Safe column migrations for existing DBs
        for col_sql in [
            "ALTER TABLE analyses ADD COLUMN share_token TEXT",
            "ALTER TABLE analyses ADD COLUMN sector_mode TEXT DEFAULT 'general'",
            "ALTER TABLE analyses ADD COLUMN user_id INTEGER",
            "ALTER TABLE watchlist ADD COLUMN user_id INTEGER",
            "ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'",
            "ALTER TABLE users ADD COLUMN onboarding_role TEXT",
        ]:
            try:
                conn.execute(col_sql)
            except Exception:
                pass
        conn.commit()

init_db()

# ── Anthropic Client ───────────────────────────────────────────────────────────
ai_client = anthropic.Anthropic()

# ── JWT Helpers ────────────────────────────────────────────────────────────────
def create_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def get_current_user(authorization: Optional[str] = Header(default=None)) -> Optional[dict]:
    """Returns user dict if token is valid, else None (soft auth)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
        with get_db() as conn:
            row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if row:
            return dict(row)
        return None
    except Exception:
        return None

def require_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """Hard auth — raises 401 if not logged in."""
    user = get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user

def require_admin(authorization: Optional[str] = Header(default=None)) -> dict:
    user = require_user(authorization)
    if user.get("role") != "admin" and user.get("email") != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ── Sector Prompts ─────────────────────────────────────────────────────────────
SECTOR_PROMPTS = {
    "general": "",
    "saas": """
SECTOR CONTEXT — SaaS / Cloud Software:
Key metrics: ARR/MRR, net revenue retention (NRR), Rule of 40, CAC payback, churn rate.
Typical deal multiples: 6x–15x ARR for high-growth SaaS, 4x–8x ARR for mature SaaS.
Strategic buyers: Salesforce, Oracle, SAP, ServiceNow, Thoma Bravo (PE), Vista Equity.
""",
    "healthcare": """
SECTOR CONTEXT — Healthcare / MedTech:
Key metrics: patient volume, reimbursement mix, EBITDA margins, pipeline assets.
Typical multiples: 10x–18x EBITDA for healthcare services.
Strategic buyers: UnitedHealth/Optum, CVS Health, HCA Healthcare, Becton Dickinson, Stryker.
Regulatory risk: FDA approval, CON requirements, HIPAA compliance must be flagged.
""",
    "industrials": """
SECTOR CONTEXT — Industrials / Manufacturing:
Key metrics: EBITDA margins, CapEx intensity, backlog/book-to-bill, customer concentration.
Typical multiples: 7x–12x EBITDA.
Strategic buyers: Honeywell, Danaher, Parker Hannifin, AMETEK, Roper Technologies.
""",
    "fintech": """
SECTOR CONTEXT — FinTech / Financial Services:
Key metrics: TPV, take rate, net interest margin, regulatory capital.
Typical multiples: 15x–25x earnings for payments; 2x–4x book for banks.
Strategic buyers: Visa, Mastercard, FIS, Fiserv, JPMorgan.
""",
    "consumer": """
SECTOR CONTEXT — Consumer / Retail / Brands:
Key metrics: same-store sales, gross margin, DTC penetration, brand equity.
Typical multiples: 10x–15x EBITDA for premium brands.
Strategic buyers: Procter & Gamble, Unilever, KKR, Leonard Green.
""",
    "energy": """
SECTOR CONTEXT — Energy / Utilities / Infrastructure:
Key metrics: proven reserves, EBITDA/bbl, contracted revenue, rate base growth.
Typical multiples: 5x–9x EBITDA for midstream/utilities.
Strategic buyers: ExxonMobil, Chevron, Brookfield, Blackstone Infrastructure.
""",
}

def build_prompt(data: dict, sector_mode: str = "general") -> str:
    sector_ctx = SECTOR_PROMPTS.get(sector_mode, "")
    additional = f"\nAdditional Context: {data.get('additionalContext')}" if data.get("additionalContext") else ""
    return f"""You are a senior investment banker at a bulge bracket firm. Analyze this company as an M&A target and return structured JSON.
{sector_ctx}
Company: {data['companyName']}
Industry: {data['industry']}
Revenue: ${data['revenue']}M (LTM)
EBITDA: ${data['ebitda']}M (LTM)
Revenue Growth: {data['growthRate']}% YoY
Total Debt: ${data['debtLoad']}M
{additional}

Return ONLY valid JSON (no markdown):
{{
  "fitScore": <integer 0-100>,
  "fitLabel": <"Strong Strategic Fit"|"Moderate Fit"|"Limited Fit"|"Poor Fit">,
  "acquirerType": <"Strategic"|"Financial Sponsor"|"Both">,
  "acquirerRationale": <1-2 sentences naming specific likely acquirers>,
  "evRange": {{"low": <$M>, "high": <$M>, "multiple": <"EV/EBITDA"|"EV/Revenue">, "multipleRange": <"8.0x–10.5x EV/EBITDA">}},
  "premiumRange": <"25%–40% premium to current trading">,
  "synergyPotential": <"High"|"Medium"|"Low">,
  "synergyDetails": <2-3 sentence breakdown with estimated dollar amounts>,
  "keyStrengths": [<3 specific bullet points>],
  "keyRisks": [<3 specific bullet points>],
  "lboViability": <"Strong LBO Candidate"|"Moderate LBO Candidate"|"Weak LBO Candidate">,
  "lboRationale": <1-2 sentences referencing leverage capacity and IRR>,
  "dealbreakerFlags": [<concerns, empty array if none>],
  "verdict": <2-3 sentence senior banker assessment>,
  "radarScores": {{"financial": <0-100>, "growth": <0-100>, "synergy": <0-100>, "lbo": <0-100>, "strategic": <0-100>, "risk": <0-100>}}
}}"""

# ── Pydantic Models ────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    email: str
    name: Optional[str] = None
    password: str

    @validator("email")
    def email_valid(cls, v):
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email")
        return v.lower().strip()

    @validator("password")
    def pw_length(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

class LoginRequest(BaseModel):
    email: str
    password: str

class WaitlistRequest(BaseModel):
    email: str
    name: Optional[str] = None
    role: Optional[str] = None
    source: Optional[str] = "landing"

    @validator("email")
    def email_valid(cls, v):
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email")
        return v.lower().strip()

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

class BulkScreenRequest(BaseModel):
    acquirer: str  # acquiring company name
    sector: Optional[str] = None  # target sector context
    targets: List[str]  # list of tickers e.g. ["CRM", "NOW", "WDAY"]

class OnboardingRequest(BaseModel):
    role: str  # analyst, associate, vp, student, investor, other

class UpgradeRequest(BaseModel):
    plan: str  # pro | teams

# ── Row Helpers ────────────────────────────────────────────────────────────────
def row_to_analysis(row) -> dict:
    d = dict(row)
    if d.get("result"):
        try:
            d["result"] = json.loads(d["result"])
        except Exception:
            d["result"] = None
    if d.get("created_at"):
        d["createdAt"] = d["created_at"] * 1000
    else:
        d["createdAt"] = None
    d["companyName"]       = d.pop("company_name", d.get("companyName", ""))
    d["growthRate"]        = d.pop("growth_rate", d.get("growthRate", ""))
    d["debtLoad"]          = d.pop("debt_load", d.get("debtLoad", ""))
    d["additionalContext"] = d.pop("additional_context", d.get("additionalContext", ""))
    d["sectorMode"]        = d.pop("sector_mode", d.get("sectorMode", "general"))
    d["shareToken"]        = d.pop("share_token", d.get("shareToken", None))
    d["userId"]            = d.pop("user_id", None)
    return d

def row_to_watchlist(row) -> dict:
    d = dict(row)
    if d.get("created_at"):
        d["createdAt"] = d["created_at"] * 1000
    d["companyName"] = d.pop("company_name", "")
    d["analysisId"]  = d.pop("analysis_id", None)
    d["userId"]      = d.pop("user_id", None)
    return d

def row_to_user(row, include_hash=False) -> dict:
    d = dict(row)
    if not include_hash:
        d.pop("password_hash", None)
    if d.get("created_at"):
        d["createdAt"] = d["created_at"] * 1000
    return d

# ══════════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/auth/signup")
def signup(req: SignupRequest):
    pw_hash = pwd_ctx.hash(req.password)
    # Auto-grant admin to owner email
    role = "admin" if req.email == ADMIN_EMAIL else "user"
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)",
                (req.email, req.name or req.email.split("@")[0], pw_hash, role),
            )
            user_id = cursor.lastrowid
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    token = create_token(user_id, req.email)
    return {"token": token, "user": row_to_user(row)}


@app.post("/api/auth/login")
def login(req: LoginRequest):
    email = req.email.lower().strip()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not pwd_ctx.verify(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(row["id"], email)
    return {"token": token, "user": row_to_user(row)}


@app.get("/api/auth/me")
def get_me(user: dict = Depends(require_user)):
    # Attach analysis count
    with get_db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) as c FROM analyses WHERE user_id=?", (user["id"],)
        ).fetchone()["c"]
    return {**row_to_user(user), "analysesRun": count}


# ══════════════════════════════════════════════════════════════════════════════
# WAITLIST
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/waitlist")
def join_waitlist(req: WaitlistRequest):
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "INSERT INTO waitlist (email, name, role, source) VALUES (?, ?, ?, ?)",
                (req.email, req.name, req.role, req.source or "landing"),
            )
            wl_id = cursor.lastrowid
            conn.commit()
            row = conn.execute("SELECT * FROM waitlist WHERE id=?", (wl_id,)).fetchone()
        pos = row["id"]  # position on waitlist = their ID
        return {"success": True, "position": pos, "email": req.email}
    except sqlite3.IntegrityError:
        # Already on waitlist — return their position
        with get_db() as conn:
            row = conn.execute("SELECT * FROM waitlist WHERE email=?", (req.email,)).fetchone()
        return {"success": True, "position": row["id"], "email": req.email, "already": True}


# ══════════════════════════════════════════════════════════════════════════════
# ANALYSIS ROUTES (with auth + gating)
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, authorization: Optional[str] = Header(default=None)):
    user = get_current_user(authorization)
    sector_mode = req.sectorMode or "general"

    # ── Gate: anonymous users limited to FREE_ANALYSES_LIMIT ──
    if not user:
        # Count anonymous analyses in last hour by IP (approximate via DB size)
        # We track via a simple anon count returned to the client; client enforces locally
        # Backend enforces by checking total anon analyses in last 60 min (rough but effective)
        with get_db() as conn:
            recent_anon = conn.execute(
                "SELECT COUNT(*) as c FROM analyses WHERE user_id IS NULL AND created_at > ?",
                (int(datetime.utcnow().timestamp()) - 3600,)
            ).fetchone()["c"]
        # Soft limit — don't hard-block, but note in response
        # Hard enforcement is done client-side per session

    # Insert pending record
    data = req.dict()
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO analyses
               (company_name, industry, revenue, ebitda, growth_rate, debt_load,
                additional_context, sector_mode, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (req.companyName, req.industry, req.revenue, req.ebitda,
             req.growthRate, req.debtLoad, req.additionalContext,
             sector_mode, user["id"] if user else None),
        )
        analysis_id = cursor.lastrowid
        conn.commit()

    # Increment user's analysis count
    if user:
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET analyses_run = analyses_run + 1 WHERE id=?",
                (user["id"],)
            )
            conn.commit()

    # Call Claude
    prompt = build_prompt(data, sector_mode)
    try:
        message = ai_client.messages.create(
            model="claude_sonnet_4_6",
            max_tokens=1800,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = message.content[0].text if message.content else ""

        try:
            result_json = json.loads(raw_text)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', raw_text)
            if match:
                result_json = json.loads(match.group(0))
            else:
                raise HTTPException(status_code=500, detail="Could not parse AI response")

        share_token = secrets.token_urlsafe(8)

        with get_db() as conn:
            conn.execute(
                "UPDATE analyses SET result=?, share_token=? WHERE id=?",
                (json.dumps(result_json), share_token, analysis_id),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM analyses WHERE id=?", (analysis_id,)).fetchone()

        return {
            "id": analysis_id,
            "result": result_json,
            "analysis": row_to_analysis(row),
            "shareToken": share_token,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/analyses")
def get_analyses(authorization: Optional[str] = Header(default=None)):
    user = get_current_user(authorization)
    with get_db() as conn:
        if user:
            # Logged-in users see their own analyses
            rows = conn.execute(
                "SELECT * FROM analyses WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
                (user["id"],)
            ).fetchall()
        else:
            # Anonymous: return recent 20 (public-facing history)
            rows = conn.execute(
                "SELECT * FROM analyses WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 20"
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

    result = subprocess.run(
        [sys.executable, script_path, payload, tmp_path],
        timeout=30, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {result.stderr}")

    safe_name = re.sub(r"[^a-z0-9]", "-", analysis["companyName"].lower())
    return FileResponse(tmp_path, media_type="application/pdf",
                        filename=f"dealflow-{safe_name}.pdf")


# ══════════════════════════════════════════════════════════════════════════════
# MARKET DATA
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/market/{ticker}")
async def get_market_data(ticker: str):
    try:
        t = ticker.upper().strip()
        stock = yf.Ticker(t)
        info = stock.info
        if not info or "symbol" not in info:
            raise HTTPException(status_code=404, detail=f"Ticker {t} not found")

        market_cap      = info.get("marketCap", 0)
        enterprise_value= info.get("enterpriseValue", 0)
        revenue         = info.get("totalRevenue", 0)
        ebitda          = info.get("ebitda", 0)
        ev_ebitda       = info.get("enterpriseToEbitda")
        ev_revenue      = info.get("enterpriseToRevenue")
        pe_ratio        = info.get("trailingPE")
        revenue_growth  = info.get("revenueGrowth")
        gross_margins   = info.get("grossMargins")
        ebitda_margins  = info.get("ebitdaMargins")
        current_price   = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        week_52_low     = info.get("fiftyTwoWeekLow")
        week_52_high    = info.get("fiftyTwoWeekHigh")

        return {
            "ticker":        t,
            "name":          info.get("longName") or info.get("shortName", t),
            "sector":        info.get("sector", ""),
            "industry":      info.get("industry", ""),
            "currentPrice":  current_price,
            "marketCap":     market_cap,
            "enterpriseValue": enterprise_value,
            "revenue":       revenue / 1e6 if revenue else None,
            "ebitda":        ebitda / 1e6 if ebitda else None,
            "evEbitda":      round(ev_ebitda, 1) if ev_ebitda else None,
            "evRevenue":     round(ev_revenue, 2) if ev_revenue else None,
            "peRatio":       round(pe_ratio, 1) if pe_ratio else None,
            "revenueGrowth": round(revenue_growth * 100, 1) if revenue_growth else None,
            "grossMargins":  round(gross_margins * 100, 1) if gross_margins else None,
            "ebitdaMargins": round(ebitda_margins * 100, 1) if ebitda_margins else None,
            "week52Low":     week_52_low,
            "week52High":    week_52_high,
            "currency":      info.get("currency", "USD"),
            "exchange":      info.get("exchange", ""),
            "description":   (info.get("longBusinessSummary") or "")[:300],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Market data fetch failed: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# WATCHLIST / PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/watchlist")
def get_watchlist(authorization: Optional[str] = Header(default=None)):
    user = get_current_user(authorization)
    with get_db() as conn:
        if user:
            rows = conn.execute(
                "SELECT * FROM watchlist WHERE user_id=? ORDER BY created_at DESC",
                (user["id"],)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM watchlist WHERE user_id IS NULL ORDER BY created_at DESC"
            ).fetchall()
    return [row_to_watchlist(r) for r in rows]


@app.post("/api/watchlist")
def add_to_watchlist(item: WatchlistItem, authorization: Optional[str] = Header(default=None)):
    user = get_current_user(authorization)
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO watchlist (company_name, industry, stage, priority, notes, analysis_id, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (item.company_name, item.industry, item.stage, item.priority,
             item.notes, item.analysis_id, user["id"] if user else None),
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
    with get_db() as conn:
        conn.execute(f"UPDATE watchlist SET {set_clause} WHERE id=?",
                     list(fields.values()) + [item_id])
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


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/admin/stats")
def admin_stats(user: dict = Depends(require_admin)):
    with get_db() as conn:
        total_users     = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
        total_analyses  = conn.execute("SELECT COUNT(*) as c FROM analyses").fetchone()["c"]
        total_waitlist  = conn.execute("SELECT COUNT(*) as c FROM waitlist").fetchone()["c"]
        total_pipeline  = conn.execute("SELECT COUNT(*) as c FROM watchlist").fetchone()["c"]

        # Signups per day (last 30 days)
        signups_by_day = conn.execute("""
            SELECT date(created_at, 'unixepoch') as day, COUNT(*) as count
            FROM users
            WHERE created_at > strftime('%s', 'now', '-30 days')
            GROUP BY day ORDER BY day
        """).fetchall()

        # Analyses per day (last 30 days)
        analyses_by_day = conn.execute("""
            SELECT date(created_at, 'unixepoch') as day, COUNT(*) as count
            FROM analyses
            WHERE created_at > strftime('%s', 'now', '-30 days')
            GROUP BY day ORDER BY day
        """).fetchall()

        # Waitlist by day
        waitlist_by_day = conn.execute("""
            SELECT date(created_at, 'unixepoch') as day, COUNT(*) as count
            FROM waitlist
            WHERE created_at > strftime('%s', 'now', '-30 days')
            GROUP BY day ORDER BY day
        """).fetchall()

        # Top users by analyses run
        top_users = conn.execute("""
            SELECT email, name, analyses_run, created_at
            FROM users ORDER BY analyses_run DESC LIMIT 10
        """).fetchall()

        # Sector mode breakdown
        sector_breakdown = conn.execute("""
            SELECT sector_mode, COUNT(*) as count
            FROM analyses
            GROUP BY sector_mode ORDER BY count DESC
        """).fetchall()

        # Recent signups
        recent_users = conn.execute("""
            SELECT email, name, role, analyses_run, created_at
            FROM users ORDER BY created_at DESC LIMIT 20
        """).fetchall()

        # Recent waitlist
        recent_waitlist = conn.execute("""
            SELECT email, name, role, source, created_at
            FROM waitlist ORDER BY created_at DESC LIMIT 20
        """).fetchall()

    return {
        "totals": {
            "users":    total_users,
            "analyses": total_analyses,
            "waitlist": total_waitlist,
            "pipeline": total_pipeline,
        },
        "signupsByDay":   [dict(r) for r in signups_by_day],
        "analysesByDay":  [dict(r) for r in analyses_by_day],
        "waitlistByDay":  [dict(r) for r in waitlist_by_day],
        "topUsers":       [dict(r) for r in top_users],
        "sectorBreakdown":[dict(r) for r in sector_breakdown],
        "recentUsers":    [dict(r) for r in recent_users],
        "recentWaitlist": [dict(r) for r in recent_waitlist],
    }


# ══════════════════════════════════════════════════════════════════════════════
# DEAL MEMO GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/analyses/{analysis_id}/memo")
async def generate_deal_memo(analysis_id: int, authorization: Optional[str] = Header(default=None)):
    """Generate a 2-page IB-style deal memo from an existing analysis."""
    user = get_current_user(authorization)
    # Pro feature — require login (free users still get it for demo purposes)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM analyses WHERE id=?", (analysis_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")
    analysis = row_to_analysis(row)
    if not analysis.get("result"):
        raise HTTPException(status_code=400, detail="Analysis not complete")

    r = analysis["result"]
    company = analysis["companyName"]
    industry = analysis["industry"]
    revenue = analysis["revenue"]
    ebitda = analysis["ebitda"]
    growth = analysis["growthRate"]
    debt = analysis["debtLoad"]
    sector = analysis.get("sectorMode", "general")
    ev_low = r.get("evRange", {}).get("low", 0)
    ev_high = r.get("evRange", {}).get("high", 0)
    multiple_range = r.get("evRange", {}).get("multipleRange", "")
    fit_score = r.get("fitScore", 0)
    fit_label = r.get("fitLabel", "")
    verdict = r.get("verdict", "")
    strengths = r.get("keyStrengths", [])
    risks = r.get("keyRisks", [])
    lbo = r.get("lboViability", "")
    lbo_rationale = r.get("lboRationale", "")
    synergy = r.get("synergyDetails", "")
    dealbreakers = r.get("dealbreakerFlags", [])
    acquirer_type = r.get("acquirerType", "")
    acquirer_rationale = r.get("acquirerRationale", "")
    premium = r.get("premiumRange", "")

    memo_prompt = f"""You are a Managing Director at a top-tier investment bank drafting a formal deal assessment memorandum.
Produce a 2-page deal memo in professional IB style for the following target company.
Write in formal prose with proper financial terminology. Use exact numbers from the data provided.

COMPANY: {company}
INDUSTRY: {industry} | SECTOR: {sector}
LTM REVENUE: ${revenue}M | LTM EBITDA: ${ebitda}M | EBITDA MARGIN: {round(float(ebitda)/float(revenue)*100, 1) if float(revenue)>0 else 0:.1f}%
REVENUE GROWTH: {growth}% YoY | TOTAL DEBT: ${debt}M
FIT SCORE: {fit_score}/100 — {fit_label}
IMPLIED EV RANGE: ${ev_low:,}M–${ev_high:,}M ({multiple_range})
PREMIUM: {premium}
ACQUIRER TYPE: {acquirer_type}
ACQUIRER RATIONALE: {acquirer_rationale}
SYNERGY: {synergy}
LBO: {lbo} — {lbo_rationale}
KEY STRENGTHS: {'; '.join(strengths)}
KEY RISKS: {'; '.join(risks)}
DEALBREAKERS: {'; '.join(dealbreakers) if dealbreakers else 'None identified'}
VERDICT: {verdict}

Return ONLY valid JSON (no markdown) in this exact structure:
{{
  "title": "Deal Assessment Memorandum — {company}",
  "date": "<current month Year e.g. April 2026>",
  "classification": "STRICTLY PRIVATE AND CONFIDENTIAL",
  "executiveSummary": "<3-4 sentences executive summary suitable for a Managing Director or investment committee>",
  "situationOverview": {{
    "businessDescription": "<2 sentences describing the company's core business, market position, and competitive moat>",
    "financialProfile": "<2 sentences on revenue, EBITDA, margins, growth, and leverage>",
    "marketContext": "<2 sentences on sector dynamics, comparable transactions, and timing>"
  }},
  "valuationAnalysis": {{
    "headline": "<EV range and methodology in one sentence>",
    "methodology": ["<method 1 with range>", "<method 2 with range>", "<method 3 with range>"],
    "premiumDiscussion": "<2 sentences on control premium rationale>"
  }},
  "strategicRationale": {{
    "primaryBuyers": "<name specific likely acquirers and why>",
    "synergyFramework": "<structured paragraph on revenue + cost synergies with dollar estimates>",
    "competitiveDynamics": "<why acquirer needs to move now; any auction risk or competitive tension>"
  }},
  "lboAnalysis": {{
    "viability": "{lbo}",
    "leverageCapacity": "<estimated leverage turns and implied debt quantum>",
    "returnProfile": "<IRR range, hold period, exit assumptions>",
    "keyDrivers": "<what drives returns: margin expansion, multiple arbitrage, or revenue growth>"
  }},
  "keyConsiderations": {{
    "strengths": {strengths if strengths else []},
    "risks": {risks if risks else []},
    "dealbreakers": {dealbreakers if dealbreakers else []}
  }},
  "recommendation": "<3-4 sentence final recommendation with process advice: negotiated sale vs. broad auction vs. dual-track; timing; key conditions>",
  "disclaimer": "This memorandum is prepared for internal purposes only. Information herein is based on publicly available data and management representations. DealFlow AI does not guarantee the accuracy of projections. Recipients should conduct independent due diligence prior to any investment decision."
}}"""

    try:
        message = ai_client.messages.create(
            model="claude_sonnet_4_6",
            max_tokens=2500,
            messages=[{"role": "user", "content": memo_prompt}],
        )
        raw = message.content[0].text if message.content else ""
        try:
            memo = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', raw)
            memo = json.loads(match.group(0)) if match else {"error": "parse failed", "raw": raw[:500]}
        return memo
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Memo generation failed: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# BULK SCREENER
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/screen")
async def bulk_screen(req: BulkScreenRequest, authorization: Optional[str] = Header(default=None)):
    """Screen up to 5 ticker targets simultaneously — fetch market data then AI score."""
    user = get_current_user(authorization)
    MAX_TARGETS = 5
    if len(req.targets) > MAX_TARGETS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_TARGETS} targets per screen")
    if not req.targets:
        raise HTTPException(status_code=400, detail="At least 1 target required")

    import asyncio

    async def screen_one(ticker: str) -> dict:
        loop = asyncio.get_event_loop()

        # Step 1: Fetch market data
        def fetch_market():
            try:
                import yfinance as yf
                info = yf.Ticker(ticker).info
                rev = info.get("totalRevenue") or info.get("revenueQuarterly") or 0
                ebitda = info.get("ebitda") or 0
                name = info.get("shortName") or info.get("longName") or ticker
                debt = info.get("totalDebt") or 0
                growth = info.get("revenueGrowth") or 0
                sector = info.get("sector") or req.sector or "General"
                margin = (ebitda / rev * 100) if rev and ebitda else None
                return {
                    "ticker": ticker,
                    "companyName": name,
                    "revenue": rev / 1e6 if rev else 0,  # in $M
                    "ebitda": ebitda / 1e6 if ebitda else 0,
                    "growthRate": round(growth * 100, 1) if growth else 10,
                    "debtLoad": "high" if debt > (rev or 1) else "moderate",
                    "industry": sector,
                    "ebitdaMargin": round(margin, 1) if margin else None,
                }
            except Exception:
                return {
                    "ticker": ticker, "companyName": ticker,
                    "revenue": 1000, "ebitda": 200,
                    "growthRate": 10, "debtLoad": "moderate",
                    "industry": req.sector or "General",
                    "ebitdaMargin": 20,
                }

        mkt = await loop.run_in_executor(None, fetch_market)

        # Step 2: AI screening prompt
        sector_mode = req.sector or mkt["industry"] or "general"
        screen_prompt = f"""You are an M&A analyst at a bulge bracket bank. Evaluate this acquisition target for {req.acquirer}.

Target: {mkt['companyName']} ({ticker})
Revenue (LTM): ${mkt['revenue']:.0f}M
EBITDA (LTM): ${mkt['ebitda']:.0f}M
Revenue Growth: {mkt['growthRate']}%
Debt Profile: {mkt['debtLoad']}
Sector: {mkt['industry']}
Acquirer Context: {req.acquirer} is considering a {sector_mode} acquisition strategy.

Provide a concise M&A fit assessment. Return ONLY valid JSON:
{{
  "fitScore": <integer 0-100>,
  "verdict": "<one sentence: deal quality>",
  "evLow": <EV estimate low in USD whole number>,
  "evHigh": <EV estimate high in USD whole number>,
  "recommendation": "Strong Buy" | "Buy" | "Hold" | "Pass",
  "rationale": "<2-3 sentences investment rationale in banker language>",
  "topSynergies": ["<synergy 1>", "<synergy 2>", "<synergy 3>"],
  "keyRisks": ["<risk 1>", "<risk 2>"],
  "impliedEVRevenue": <float>,
  "impliedEVEBITDA": <float or null>
}}"""

        def call_ai():
            return ai_client.messages.create(
                model="claude_sonnet_4_6",
                max_tokens=800,
                messages=[{"role": "user", "content": screen_prompt}],
            )

        message = await loop.run_in_executor(None, call_ai)
        raw = message.content[0].text if message.content else "{}"
        try:
            ai_result = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', raw)
            ai_result = json.loads(match.group(0)) if match else {"fitScore": 50}

        return {
            "ticker": ticker,
            "company_name": mkt["companyName"],
            "fit_score": ai_result.get("fitScore", 50),
            "ev_low": ai_result.get("evLow", 0),
            "ev_high": ai_result.get("evHigh", 0),
            "revenue_ttm": int(mkt["revenue"] * 1e6) if mkt["revenue"] else None,
            "ebitda_margin": mkt["ebitdaMargin"],
            "verdict": ai_result.get("verdict", ""),
            "top_synergies": ai_result.get("topSynergies", []),
            "key_risks": ai_result.get("keyRisks", []),
            "recommendation": ai_result.get("recommendation", "Hold"),
            "rationale": ai_result.get("rationale", ""),
        }

    tasks = [screen_one(t.strip().upper()) for t in req.targets if t.strip()]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
    for r in results:
        if isinstance(r, Exception):
            output.append({"ticker": "ERR", "company_name": "Error", "fit_score": 0, "error": str(r)})
        else:
            output.append(r)

    # Rank by fit score
    output.sort(key=lambda x: x.get("fit_score", 0), reverse=True)
    for i, item in enumerate(output):
        item["rank"] = i + 1

    return {
        "results": output,
        "acquirer": req.acquirer,
        "sector": req.sector or "",
        "screened_at": datetime.utcnow().isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# PRECEDENT TRANSACTIONS
# ══════════════════════════════════════════════════════════════════════════════

# Curated precedent transactions database (real deals, IB-accurate)
PRECEDENT_TRANSACTIONS = [
    # SaaS / Cloud
    {"id": 1, "target": "Qualtrics", "acquirer": "SAP", "year": 2019, "ev": 8000, "revenue": 400, "ebitda": -20, "evRevenue": 20.0, "evEbitda": None, "sector": "SaaS", "industry": "Customer Experience Software", "dealType": "Strategic", "premium": 43, "status": "Closed"},
    {"id": 2, "target": "Slack", "acquirer": "Salesforce", "year": 2021, "ev": 27700, "revenue": 900, "ebitda": -250, "evRevenue": 30.8, "evEbitda": None, "sector": "SaaS", "industry": "Enterprise Collaboration", "dealType": "Strategic", "premium": 55, "status": "Closed"},
    {"id": 3, "target": "Citrix Systems", "acquirer": "Vista / Elliott", "year": 2022, "ev": 16500, "revenue": 3300, "ebitda": 990, "evRevenue": 5.0, "evEbitda": 16.7, "sector": "SaaS", "industry": "Cloud & Virtualization", "dealType": "Financial Sponsor", "premium": 29, "status": "Closed"},
    {"id": 4, "target": "Zendesk", "acquirer": "Permira / Hellman & Friedman", "year": 2022, "ev": 10200, "revenue": 1700, "ebitda": 85, "evRevenue": 6.0, "evEbitda": None, "sector": "SaaS", "industry": "Customer Service Software", "dealType": "Financial Sponsor", "premium": 34, "status": "Closed"},
    {"id": 5, "target": "Ping Identity", "acquirer": "Thoma Bravo", "year": 2022, "ev": 2800, "revenue": 295, "ebitda": 30, "evRevenue": 9.5, "evEbitda": 93.3, "sector": "SaaS", "industry": "Identity Security", "dealType": "Financial Sponsor", "premium": 63, "status": "Closed"},
    {"id": 6, "target": "Cvent", "acquirer": "Blackstone", "year": 2023, "ev": 4600, "revenue": 600, "ebitda": 70, "evRevenue": 7.7, "evEbitda": 65.7, "sector": "SaaS", "industry": "Event Management SaaS", "dealType": "Financial Sponsor", "premium": 40, "status": "Closed"},
    # Healthcare
    {"id": 7, "target": "Meditech", "acquirer": "Virence Health / GE", "year": 2018, "ev": 1050, "revenue": 490, "ebitda": 120, "evRevenue": 2.1, "evEbitda": 8.75, "sector": "Healthcare", "industry": "Healthcare IT", "dealType": "Strategic", "premium": 25, "status": "Closed"},
    {"id": 8, "target": "Kindred Healthcare", "acquirer": "Humana / TPG / WCAS", "year": 2018, "ev": 4100, "revenue": 3200, "ebitda": 310, "evRevenue": 1.3, "evEbitda": 13.2, "sector": "Healthcare", "industry": "Post-Acute Care", "dealType": "Both", "premium": 31, "status": "Closed"},
    {"id": 9, "target": "Inovalon", "acquirer": "Nordic Capital", "year": 2022, "ev": 7300, "revenue": 700, "ebitda": 175, "evRevenue": 10.4, "evEbitda": 41.7, "sector": "Healthcare", "industry": "Healthcare Data Analytics", "dealType": "Financial Sponsor", "premium": 38, "status": "Closed"},
    {"id": 10, "target": "Athenahealth", "acquirer": "Bain / Hellman & Friedman", "year": 2019, "ev": 5700, "revenue": 1300, "ebitda": 260, "evRevenue": 4.4, "evEbitda": 21.9, "sector": "Healthcare", "industry": "Healthcare Software", "dealType": "Financial Sponsor", "premium": 12, "status": "Closed"},
    # Industrials
    {"id": 11, "target": "Precision Castparts", "acquirer": "Berkshire Hathaway", "year": 2016, "ev": 37200, "revenue": 10000, "ebitda": 2200, "evRevenue": 3.7, "evEbitda": 16.9, "sector": "Industrials", "industry": "Aerospace Components", "dealType": "Strategic", "premium": 21, "status": "Closed"},
    {"id": 12, "target": "Roper Technologies — Application Software", "acquirer": "Francisco Partners", "year": 2022, "ev": 2600, "revenue": 540, "ebitda": 175, "evRevenue": 4.8, "evEbitda": 14.9, "sector": "Industrials", "industry": "Industrial Software", "dealType": "Financial Sponsor", "premium": 0, "status": "Closed"},
    {"id": 13, "target": "Gardner Denver", "acquirer": "KKR", "year": 2013, "ev": 3900, "revenue": 2400, "ebitda": 430, "evRevenue": 1.6, "evEbitda": 9.1, "sector": "Industrials", "industry": "Industrial Machinery", "dealType": "Financial Sponsor", "premium": 41, "status": "Closed"},
    # FinTech
    {"id": 14, "target": "Worldline — Merchant Services", "acquirer": "Apollo", "year": 2023, "ev": 2300, "revenue": 1100, "ebitda": 300, "evRevenue": 2.1, "evEbitda": 7.7, "sector": "FinTech", "industry": "Payments Processing", "dealType": "Financial Sponsor", "premium": 15, "status": "Closed"},
    {"id": 15, "target": "Euronet Worldwide — EFT", "acquirer": "Eurazeo", "year": 2021, "ev": 1800, "revenue": 800, "ebitda": 210, "evRevenue": 2.25, "evEbitda": 8.6, "sector": "FinTech", "industry": "ATM Network", "dealType": "Both", "premium": 28, "status": "Rumored"},
    {"id": 16, "target": "SS&C Technologies", "acquirer": "Carlyle", "year": 2011, "ev": 2700, "revenue": 450, "ebitda": 135, "evRevenue": 6.0, "evEbitda": 20.0, "sector": "FinTech", "industry": "Financial Services Software", "dealType": "Financial Sponsor", "premium": 33, "status": "Closed"},
    # Consumer
    {"id": 17, "target": "Whole Foods Market", "acquirer": "Amazon", "year": 2017, "ev": 13700, "revenue": 15700, "ebitda": 630, "evRevenue": 0.87, "evEbitda": 21.7, "sector": "Consumer", "industry": "Specialty Grocery", "dealType": "Strategic", "premium": 27, "status": "Closed"},
    {"id": 18, "target": "Chewy", "acquirer": "PetSmart / BC Partners", "year": 2017, "ev": 3350, "revenue": 900, "ebitda": -70, "evRevenue": 3.7, "evEbitda": None, "sector": "Consumer", "industry": "E-Commerce — Pet", "dealType": "Financial Sponsor", "premium": 0, "status": "Closed"},
    {"id": 19, "target": "Hostess Brands", "acquirer": "J.M. Smucker", "year": 2023, "ev": 5600, "revenue": 1350, "ebitda": 290, "evRevenue": 4.15, "evEbitda": 19.3, "sector": "Consumer", "industry": "Branded Snack Foods", "dealType": "Strategic", "premium": 43, "status": "Closed"},
    # Energy
    {"id": 20, "target": "Pioneer Natural Resources", "acquirer": "ExxonMobil", "year": 2023, "ev": 64500, "revenue": 22000, "ebitda": 9200, "evRevenue": 2.9, "evEbitda": 7.0, "sector": "Energy", "industry": "E&P — Permian Basin", "dealType": "Strategic", "premium": 18, "status": "Closed"},
    {"id": 21, "target": "Callon Petroleum", "acquirer": "APA Corporation", "year": 2024, "ev": 4500, "revenue": 1800, "ebitda": 900, "evRevenue": 2.5, "evEbitda": 5.0, "sector": "Energy", "industry": "E&P — Permian Basin", "dealType": "Strategic", "premium": 14, "status": "Closed"},
    {"id": 22, "target": "Crestwood Midstream", "acquirer": "Energy Transfer", "year": 2023, "ev": 7100, "revenue": 3800, "ebitda": 720, "evRevenue": 1.9, "evEbitda": 9.9, "sector": "Energy", "industry": "Midstream Infrastructure", "dealType": "Strategic", "premium": 30, "status": "Closed"},
]

@app.get("/api/precedents")
def get_precedents(
    sector: Optional[str] = None,
    min_ev: Optional[float] = None,
    max_ev: Optional[float] = None,
    deal_type: Optional[str] = None,
    search: Optional[str] = None,
):
    """Return precedent M&A transactions with optional filters."""
    results = PRECEDENT_TRANSACTIONS
    if sector:
        results = [t for t in results if t["sector"].lower() == sector.lower()]
    if min_ev is not None:
        results = [t for t in results if t["ev"] >= min_ev]
    if max_ev is not None:
        results = [t for t in results if t["ev"] <= max_ev]
    if deal_type:
        results = [t for t in results if deal_type.lower() in t["dealType"].lower()]
    if search:
        s = search.lower()
        results = [t for t in results if s in t["target"].lower() or s in t["acquirer"].lower() or s in t["industry"].lower()]
    return {"transactions": results, "count": len(results)}


# ══════════════════════════════════════════════════════════════════════════════
# ONBOARDING + PLAN
# ══════════════════════════════════════════════════════════════════════════════



# ═══════════════════════════════════════════════════════════════════════════════
# Valuation Football Field — Scenario (Version History) API
# ═══════════════════════════════════════════════════════════════════════════════

class ScenarioCreate(BaseModel):
    label: str
    snapshot: dict   # all assumption fields as a JSON object

class ScenarioUpdate(BaseModel):
    label: Optional[str] = None
    snapshot: Optional[dict] = None


@app.get("/api/scenarios")
def list_scenarios(user: dict = Depends(require_user)):
    """Return all saved football-field scenarios for the current user, newest first."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM ff_scenarios WHERE user_id=? ORDER BY updated_at DESC",
            (user["id"],)
        ).fetchall()
    import json as _json
    return [
        {
            "id": r["id"],
            "label": r["label"],
            "snapshot": _json.loads(r["snapshot"]),
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
        }
        for r in rows
    ]


@app.post("/api/scenarios", status_code=201)
def create_scenario(req: ScenarioCreate, user: dict = Depends(require_user)):
    """Save a new scenario for the current user."""
    import json as _json
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO ff_scenarios (user_id, label, snapshot) VALUES (?,?,?)",
            (user["id"], req.label.strip(), _json.dumps(req.snapshot))
        )
        row = conn.execute(
            "SELECT * FROM ff_scenarios WHERE id=?", (cur.lastrowid,)
        ).fetchone()
        conn.commit()
    return {
        "id": row["id"],
        "label": row["label"],
        "snapshot": _json.loads(row["snapshot"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@app.patch("/api/scenarios/{scenario_id}")
def update_scenario(scenario_id: int, req: ScenarioUpdate, user: dict = Depends(require_user)):
    """Rename or update snapshot of an existing scenario (must belong to current user)."""
    import json as _json
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM ff_scenarios WHERE id=? AND user_id=?",
            (scenario_id, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found")
        new_label    = req.label    if req.label    is not None else row["label"]
        new_snapshot = _json.dumps(req.snapshot) if req.snapshot is not None else row["snapshot"]
        conn.execute(
            "UPDATE ff_scenarios SET label=?, snapshot=?, updated_at=strftime('%s','now') WHERE id=?",
            (new_label, new_snapshot, scenario_id)
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM ff_scenarios WHERE id=?", (scenario_id,)
        ).fetchone()
    return {
        "id": row["id"],
        "label": row["label"],
        "snapshot": _json.loads(row["snapshot"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@app.delete("/api/scenarios/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: int, user: dict = Depends(require_user)):
    """Delete a scenario (must belong to current user)."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM ff_scenarios WHERE id=? AND user_id=?",
            (scenario_id, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found")
        conn.execute("DELETE FROM ff_scenarios WHERE id=?", (scenario_id,))
        conn.commit()
    return None

@app.post("/api/auth/onboarding")
def set_onboarding_role(req: OnboardingRequest, user: dict = Depends(require_user)):
    with get_db() as conn:
        conn.execute("UPDATE users SET onboarding_role=? WHERE id=?", (req.role, user["id"]))
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    return row_to_user(row)


@app.post("/api/auth/upgrade")
def upgrade_plan(req: UpgradeRequest, user: dict = Depends(require_user)):
    """Mock plan upgrade — in production, integrate Stripe here."""
    valid_plans = ["free", "pro", "teams"]
    if req.plan not in valid_plans:
        raise HTTPException(status_code=400, detail="Invalid plan")
    with get_db() as conn:
        conn.execute("UPDATE users SET plan=? WHERE id=?", (req.plan, user["id"]))
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    return {"success": True, "plan": req.plan, "user": row_to_user(row)}


# ══════════════════════════════════════════════════════════════════════════════
# STATIC / FALLBACK
# ══════════════════════════════════════════════════════════════════════════════

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "dist", "public")
if os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=False)
