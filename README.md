# DealFlow AI — M&A Deal Assessment Tool

A full-stack web application that analyzes companies as M&A targets using AI, outputting a structured deal assessment that mirrors how investment bankers evaluate acquisition opportunities. Built with React, Express, and Claude AI.

**Live demo:** [dealflow-ai.perplexity.ai](https://www.perplexity.ai/computer/a/dealflow-ai-m-a-analyzer-Bw7rOv99T6OJCmPoRefa0g)

---

## What It Does

Input a company's financial profile — revenue, EBITDA, growth rate, debt load — and receive a structured AI-generated deal assessment covering:

| Output | Description |
|---|---|
| **Fit Score (0–100)** | Quantified deal attractiveness based on financial profile |
| **Acquirer Classification** | Strategic vs. Financial Sponsor vs. Both, with rationale |
| **Valuation Range** | EV estimate with appropriate trading multiples (EV/EBITDA or EV/Revenue) |
| **Premium Range** | Estimated acquisition premium over current market value |
| **Synergy Analysis** | High/Medium/Low potential with specific cost and revenue synergy breakdown |
| **LBO Viability** | Leverage capacity analysis and cash flow coverage assessment |
| **Key Strengths & Risks** | Investment considerations framed as a banker would present them |
| **Dealbreaker Flags** | Surfaced when real structural issues exist (e.g., PBC governance, antitrust exposure) |
| **Banker's Verdict** | 2–3 sentence deal assessment in institutional voice |
| **PDF Export** | One-click deal memo export suitable for attachment or printing |

---

## Financial Methodology

The AI analysis is prompted to reason through each deal the way a junior banker would build a pitch book page — not generic output, but structured reasoning tied to the specific financial inputs.

### Valuation Framework

The model applies different valuation approaches depending on the company profile:

- **High-growth SaaS / tech:** Revenue multiples (EV/Revenue), benchmarked against comparable public comps. A company with 30%+ growth and negative EBITDA is valued on forward revenue, not current earnings.
- **Mature / cash-generative businesses:** EBITDA multiples (EV/EBITDA), referencing typical sector ranges (e.g., 8–12x for industrials, 12–18x for healthcare services, 20–30x for high-quality SaaS).
- **Distressed / turnaround situations:** Asset-based or recovery-based framing when EBITDA is negative or highly compressed.

### Acquirer Classification

The model distinguishes between:

- **Strategic acquirers** — corporate buyers seeking synergies, market share, or capability acquisition. Rationale references specific cost and revenue synergy mechanisms.
- **Financial sponsors (PE)** — leverage-focused buyers targeting IRR. The LBO analysis assesses whether the company's free cash flow can service typical 4–6x levered debt structures and achieve a 20%+ IRR over a 3–7 year hold.
- **Both** — when the asset is attractive to both buyer types, the model explains the competitive dynamic and how each would approach pricing.

### Synergy Estimation

Synergy potential is classified as High / Medium / Low based on:
- **Revenue synergies:** Cross-sell opportunities, geographic expansion, customer base access
- **Cost synergies:** G&A consolidation, shared infrastructure, procurement leverage, go-to-market overlap
- **Strategic synergies:** Proprietary data, IP, regulatory assets, or platform network effects

### LBO Analysis

For each target, the model evaluates:
1. **Leverage capacity:** Can the business support 4–6x EBITDA in debt?
2. **Free cash flow conversion:** Is EBITDA translatable to FCF for debt service?
3. **Entry/exit multiple expansion:** Is there a credible path to value creation beyond leverage?
4. **Equity check sizing:** Is the required equity check consistent with typical fund sizes?

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Express.js, Node.js |
| Database | SQLite (via Drizzle ORM) |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| PDF Export | Python / ReportLab |
| Build | Vite |

---

## Project Structure

```
deal-flow-analyzer/
├── client/
│   └── src/
│       ├── pages/home.tsx        # Main app UI
│       └── components/           # shadcn/ui components
├── server/
│   ├── routes.ts                 # Express API endpoints
│   ├── storage.ts                # Drizzle ORM storage layer
│   └── pdf_export.py             # ReportLab PDF generation
├── shared/
│   └── schema.ts                 # Drizzle schema + Zod types
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analyze` | Submit company for AI analysis |
| `GET` | `/api/analyses` | Retrieve recent analyses (last 20) |
| `GET` | `/api/analyses/:id` | Get a single analysis by ID |
| `GET` | `/api/analyses/:id/pdf` | Download deal memo as PDF |

### POST /api/analyze

**Request body:**
```json
{
  "companyName": "Acme Corp",
  "industry": "Healthcare SaaS",
  "revenue": "250",
  "ebitda": "55",
  "growthRate": "22",
  "debtLoad": "40",
  "additionalContext": "Optional qualitative context"
}
```

**Response:**
```json
{
  "id": 1,
  "result": {
    "fitScore": 78,
    "fitLabel": "Strong Strategic Fit",
    "acquirerType": "Both",
    "evRange": { "low": 1800, "high": 2400, "multipleRange": "33.0x–44.0x EV/EBITDA" },
    "synergyPotential": "High",
    "lboViability": "Moderate LBO Candidate",
    "keyStrengths": [...],
    "keyRisks": [...],
    "verdict": "..."
  }
}
```

---

## Running Locally

```bash
# Install dependencies
npm install
pip install reportlab

# Start development server
npm run dev
```

The app runs on `http://localhost:5000`. Set `ANTHROPIC_API_KEY` in your environment before starting.

---

## Example Output

Running Veeva Systems ($2.38B revenue, $820M EBITDA, 0 debt, Life Sciences SaaS):

> **Fit Score: 88 / 100 — Strong Strategic Fit**
> 
> Acquirer Type: Both (Strategic + Financial Sponsor)
> 
> EV Range: $28.0B — $38.0B at 34.1x–46.3x EV/EBITDA
> 
> Synergy Potential: High — strategic acquirer could realize significant revenue synergies by cross-selling Veeva's CRM and Vault platforms into an existing enterprise software customer base.
>
> LBO Viability: Moderate — zero debt and ~$820M EBITDA supports meaningful leverage capacity of 6–8x, implying $4.9–6.6B of debt financing; however, at a $28–38B entry EV, the equity check size compresses returns significantly.
>
> Dealbreaker Flags: PBC (Public Benefit Corporation) structure gives management and the board explicit legal cover to reject deals not deemed in the public interest.

---

## Disclaimer

This tool is for demonstration and educational purposes only. Output does not constitute investment advice, a formal valuation opinion, or a recommendation to buy or sell any security.

---

*Built by Jessica Yang — Finance & Statistics, University of Florida*
