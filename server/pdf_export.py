#!/usr/bin/env python3
"""
DealFlow PDF export — generates a banker-style deal assessment memo.
Usage: python pdf_export.py '<json_data>' '<output_path>'
"""

import sys
import json
import urllib.request
from pathlib import Path
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics

# ─── Fonts ──────────────────────────────────────────────────────────────────

FONT_DIR = Path("/tmp/fonts_dealflow")
FONT_DIR.mkdir(exist_ok=True)

def dl_font(name, url):
    p = FONT_DIR / name
    if not p.exists():
        urllib.request.urlretrieve(url, p)
    return str(p)

# Inter (body) and DM Sans (headings) — professional, finance-appropriate
inter_regular = dl_font("Inter-Regular.ttf",
    "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf")
dm_bold = dl_font("DMSans-Bold.ttf",
    "https://github.com/google/fonts/raw/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf")

try:
    pdfmetrics.registerFont(TTFont("Inter", inter_regular))
    pdfmetrics.registerFont(TTFont("DMSans-Bold", dm_bold))
    BODY_FONT = "Inter"
    HEAD_FONT = "DMSans-Bold"
except Exception:
    BODY_FONT = "Helvetica"
    HEAD_FONT = "Helvetica-Bold"

# ─── Palette ────────────────────────────────────────────────────────────────

NAVY       = HexColor("#0a1628")
BLUE       = HexColor("#1a5fa8")
BLUE_LIGHT = HexColor("#e8f0fb")
GREEN      = HexColor("#176a37")
GREEN_BG   = HexColor("#e6f4ec")
AMBER      = HexColor("#92520a")
AMBER_BG   = HexColor("#fdf0e0")
RED        = HexColor("#8b1a1a")
RED_BG     = HexColor("#fde8e8")
GRAY_DARK  = HexColor("#1e2535")
GRAY_MID   = HexColor("#5a6275")
GRAY_LIGHT = HexColor("#f4f5f7")
BORDER     = HexColor("#d0d5e0")
WHITE      = white

# ─── Styles ─────────────────────────────────────────────────────────────────

def make_styles():
    s = getSampleStyleSheet()
    base = dict(fontName=BODY_FONT, textColor=GRAY_DARK)

    cover_company = ParagraphStyle("CoverCompany", parent=s["Normal"],
        fontName=HEAD_FONT, fontSize=28, leading=34, textColor=NAVY, spaceAfter=6)
    cover_sub = ParagraphStyle("CoverSub", parent=s["Normal"],
        fontName=BODY_FONT, fontSize=13, leading=18, textColor=GRAY_MID, spaceAfter=4)

    section_head = ParagraphStyle("SectionHead", parent=s["Normal"],
        fontName=HEAD_FONT, fontSize=9, leading=12, textColor=GRAY_MID,
        spaceBefore=14, spaceAfter=4, letterSpacing=1.2,
        textTransform="uppercase" if hasattr(ParagraphStyle, "textTransform") else None)

    body = ParagraphStyle("Body", parent=s["Normal"],
        **base, fontSize=9.5, leading=14.5, spaceAfter=6)
    body_small = ParagraphStyle("BodySmall", parent=s["Normal"],
        **base, fontSize=8.5, leading=13, spaceAfter=4)
    bullet = ParagraphStyle("Bullet", parent=s["Normal"],
        **base, fontSize=9, leading=13.5, leftIndent=10, bulletIndent=0, spaceAfter=3)
    label = ParagraphStyle("Label", parent=s["Normal"],
        fontName=HEAD_FONT, fontSize=7.5, leading=10, textColor=GRAY_MID,
        spaceAfter=2)
    value_large = ParagraphStyle("ValueLarge", parent=s["Normal"],
        fontName=HEAD_FONT, fontSize=18, leading=22, textColor=BLUE, spaceAfter=2)
    value_med = ParagraphStyle("ValueMed", parent=s["Normal"],
        fontName=HEAD_FONT, fontSize=12, leading=16, textColor=NAVY, spaceAfter=2)
    tag = ParagraphStyle("Tag", parent=s["Normal"],
        fontName=HEAD_FONT, fontSize=7.5, leading=10, textColor=BLUE)
    footer = ParagraphStyle("Footer", parent=s["Normal"],
        fontName=BODY_FONT, fontSize=7.5, leading=10, textColor=GRAY_MID)
    verdict = ParagraphStyle("Verdict", parent=s["Normal"],
        **base, fontSize=10, leading=16, spaceAfter=0,
        leftIndent=10, rightIndent=10)

    return dict(
        cover_company=cover_company, cover_sub=cover_sub,
        section_head=section_head, body=body, body_small=body_small,
        bullet=bullet, label=label, value_large=value_large,
        value_med=value_med, tag=tag, footer=footer, verdict=verdict
    )

# ─── Helpers ────────────────────────────────────────────────────────────────

def fmt_currency(val):
    try:
        v = float(val)
        if v >= 1000:
            return f"${v/1000:.1f}B"
        return f"${v:.0f}M"
    except Exception:
        return str(val)

def score_color(score):
    if score >= 75: return GREEN, GREEN_BG
    if score >= 50: return BLUE,  BLUE_LIGHT
    if score >= 30: return AMBER, AMBER_BG
    return RED, RED_BG

def fit_label_color(label):
    label = label.lower()
    if "strong" in label:  return GREEN, GREEN_BG
    if "moderate" in label: return BLUE, BLUE_LIGHT
    if "limited" in label:  return AMBER, AMBER_BG
    return RED, RED_BG

def lbo_color(viability):
    v = viability.lower()
    if "strong" in v:   return GREEN, GREEN_BG
    if "moderate" in v: return AMBER, AMBER_BG
    return RED, RED_BG

def synergy_color(synergy):
    s = synergy.lower()
    if s == "high":   return GREEN, GREEN_BG
    if s == "medium": return BLUE, BLUE_LIGHT
    return GRAY_MID, GRAY_LIGHT

def section_title(text, st):
    """Returns a small caps section header with a rule."""
    return [
        HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=4, spaceBefore=10),
        Paragraph(text.upper(), st["section_head"]),
    ]

def kpi_row(items, st, page_width):
    """Renders a row of KPI cards side by side in a table."""
    cell_data = []
    for label, value, sublabel in items:
        cell = [
            Paragraph(label, st["label"]),
            Paragraph(value, st["value_large"]),
        ]
        if sublabel:
            cell.append(Paragraph(sublabel, st["body_small"]))
        cell_data.append(cell)

    col_w = page_width / len(items)
    t = Table([cell_data], colWidths=[col_w] * len(items))
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t

def score_badge_table(score, fit_label, st, page_width):
    """Score badge + fit label side-by-side."""
    fg, bg = score_color(score)
    fit_fg, fit_bg = fit_label_color(fit_label)

    score_cell = Table(
        [[Paragraph(f"{score}", ParagraphStyle("ScoreNum", parent=st["body"],
            fontName=HEAD_FONT, fontSize=32, leading=36, textColor=fg)),
          Paragraph("/100", ParagraphStyle("ScoreDenom", parent=st["body"],
              fontName=BODY_FONT, fontSize=11, leading=36, textColor=GRAY_MID))]],
        colWidths=[50, 35]
    )
    score_cell.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    fit_cell = Table(
        [[Paragraph(fit_label, ParagraphStyle("FitLabel", parent=st["body"],
            fontName=HEAD_FONT, fontSize=11, leading=14, textColor=fit_fg))]],
        colWidths=[page_width - 90]
    )
    fit_cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fit_bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))

    outer = Table([[score_cell, fit_cell]], colWidths=[90, page_width - 90])
    outer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return outer

def two_col_section(left_items, right_items, st, page_width):
    """Two-column layout for strengths/risks."""
    def build_col(title, items, fg, marker):
        cells = [Paragraph(title.upper(), st["label"])]
        for item in items:
            cells.append(Paragraph(f"{marker}  {item}", st["bullet"]))
        return cells

    left = build_col("Key Strengths", left_items, GREEN, "+")
    right = build_col("Key Risks", right_items, RED, "-")

    max_rows = max(len(left), len(right))
    while len(left) < max_rows: left.append(Paragraph("", st["body_small"]))
    while len(right) < max_rows: right.append(Paragraph("", st["body_small"]))

    col_w = (page_width - 10) / 2
    rows = [[l, r] for l, r in zip(left, right)]
    t = Table(rows, colWidths=[col_w, col_w])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t

def tag_cell(label, fg, bg):
    """Colored badge table cell."""
    inner = Table([[Paragraph(label, ParagraphStyle("TagInner",
        fontName=HEAD_FONT, fontSize=8, leading=10, textColor=fg))]])
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return inner

# ─── Main Builder ────────────────────────────────────────────────────────────

def build_pdf(analysis_data: dict, output_path: str):
    r = analysis_data.get("result", analysis_data)
    meta = {
        "companyName": analysis_data.get("companyName", "Unknown Company"),
        "industry": analysis_data.get("industry", ""),
        "revenue": analysis_data.get("revenue", ""),
        "ebitda": analysis_data.get("ebitda", ""),
        "growthRate": analysis_data.get("growthRate", ""),
        "debtLoad": analysis_data.get("debtLoad", ""),
    }

    W, H = letter
    margin = 0.85 * inch
    pw = W - 2 * margin  # printable width

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=margin, rightMargin=margin,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        title=f"M&A Deal Assessment — {meta['companyName']}",
        author="Perplexity Computer",
    )

    st = make_styles()
    story = []
    today = datetime.now().strftime("%B %d, %Y")

    # ── Header banner ──────────────────────────────────────────────────────
    header_data = [[
        Paragraph(f"<font color='#ffffff'><b>DEALFLOW AI</b></font>  "
                  f"<font color='#9bbde0' size='8'>M&amp;A Deal Assessment</font>",
                  ParagraphStyle("HdrLeft", fontName=HEAD_FONT, fontSize=11,
                      leading=14, textColor=WHITE)),
        Paragraph(f"<font color='#9bbde0'>{today}</font>",
                  ParagraphStyle("HdrRight", fontName=BODY_FONT, fontSize=8,
                      leading=14, textColor=WHITE, alignment=2)),
    ]]
    header_table = Table(header_data, colWidths=[pw * 0.65, pw * 0.35])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 14))

    # ── Company name + metadata ────────────────────────────────────────────
    story.append(Paragraph(meta["companyName"], st["cover_company"]))
    story.append(Paragraph(meta["industry"], st["cover_sub"]))

    # Input data strip
    fin_items = []
    if meta["revenue"]:    fin_items.append(f"Revenue: {fmt_currency(meta['revenue'])}")
    if meta["ebitda"]:     fin_items.append(f"EBITDA: {fmt_currency(meta['ebitda'])}")
    if meta["growthRate"]: fin_items.append(f"Growth: {meta['growthRate']}% YoY")
    if meta["debtLoad"]:   fin_items.append(f"Debt: {fmt_currency(meta['debtLoad'])}")

    if fin_items:
        fin_row = "  ·  ".join(fin_items)
        story.append(Paragraph(fin_row,
            ParagraphStyle("FinRow", fontName=BODY_FONT, fontSize=8.5, leading=12,
                textColor=GRAY_MID, spaceAfter=10)))

    story.append(HRFlowable(width="100%", thickness=1.5, color=NAVY, spaceAfter=12))

    # ── Fit Score ─────────────────────────────────────────────────────────
    fit_score = r.get("fitScore", 0)
    fit_label = r.get("fitLabel", "")
    story.append(score_badge_table(fit_score, fit_label, st, pw))
    story.append(Spacer(1, 10))

    # ── Acquirer ──────────────────────────────────────────────────────────
    acq_type = r.get("acquirerType", "")
    acq_rationale = r.get("acquirerRationale", "")

    acq_table_data = [[
        [Paragraph("ACQUIRER TYPE", st["label"]),
         Paragraph(acq_type, st["value_med"])],
        [Paragraph("RATIONALE", st["label"]),
         Paragraph(acq_rationale, st["body"])],
    ]]
    acq_table = Table(acq_table_data, colWidths=[pw * 0.25, pw * 0.75])
    acq_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(acq_table)
    story.append(Spacer(1, 8))

    # ── Valuation ─────────────────────────────────────────────────────────
    story += section_title("Valuation Range", st)
    ev = r.get("evRange", {})
    ev_low  = ev.get("low", 0)
    ev_high = ev.get("high", 0)
    mult    = ev.get("multipleRange", "")
    premium = r.get("premiumRange", "")

    ev_str = f"{fmt_currency(ev_low)}  —  {fmt_currency(ev_high)}"
    val_table_data = [[
        [Paragraph("ENTERPRISE VALUE RANGE", st["label"]),
         Paragraph(ev_str, ParagraphStyle("EVVal", fontName=HEAD_FONT, fontSize=20,
             leading=24, textColor=BLUE))],
        [Paragraph("TRADING MULTIPLE", st["label"]),
         Paragraph(mult, st["value_med"])],
        [Paragraph("PREMIUM ESTIMATE", st["label"]),
         Paragraph(premium or "—", st["value_med"])],
    ]]
    val_table = Table(val_table_data, colWidths=[pw * 0.40, pw * 0.30, pw * 0.30])
    val_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, 0), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEAFTER", (0, 0), (1, 0), 0.5, BORDER),
    ]))
    story.append(val_table)

    # ── Synergy + LBO ──────────────────────────────────────────────────────
    story += section_title("Synergy & LBO Analysis", st)
    syn_pot = r.get("synergyPotential", "")
    syn_det = r.get("synergyDetails", "")
    lbo_via = r.get("lboViability", "")
    lbo_rat = r.get("lboRationale", "")

    syn_fg, syn_bg = synergy_color(syn_pot)
    lbo_fg, lbo_bg = lbo_color(lbo_via)

    syn_lbo_data = [[
        [Paragraph("SYNERGY POTENTIAL", st["label"]),
         tag_cell(syn_pot.upper(), syn_fg, syn_bg),
         Spacer(1, 4),
         Paragraph(syn_det, st["body_small"])],
        [Paragraph("LBO VIABILITY", st["label"]),
         tag_cell(lbo_via.replace(" Candidate", "").upper(), lbo_fg, lbo_bg),
         Spacer(1, 4),
         Paragraph(lbo_rat, st["body_small"])],
    ]]
    syn_lbo_table = Table(syn_lbo_data, colWidths=[pw * 0.50, pw * 0.50])
    syn_lbo_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(syn_lbo_table)

    # ── Strengths & Risks ─────────────────────────────────────────────────
    story += section_title("Investment Considerations", st)
    story.append(two_col_section(
        r.get("keyStrengths", []),
        r.get("keyRisks", []),
        st, pw
    ))

    # ── Dealbreaker Flags ─────────────────────────────────────────────────
    flags = r.get("dealbreakerFlags", [])
    if flags:
        story += section_title("Dealbreaker Flags", st)
        for f in flags:
            story.append(Paragraph(f"[!]  {f}", ParagraphStyle("Flag",
                parent=st["bullet"], textColor=RED, fontName=HEAD_FONT, fontSize=9)))

    # ── Verdict ───────────────────────────────────────────────────────────
    story += section_title("Banker's Verdict", st)
    verdict_text = r.get("verdict", "")
    verdict_table = Table(
        [[Paragraph(verdict_text, st["verdict"])]],
        colWidths=[pw]
    )
    verdict_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLUE_LIGHT),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEAFTER", (0, 0), (0, -1), 3, BLUE),
    ]))
    story.append(verdict_table)
    story.append(Spacer(1, 14))

    # ── Disclaimer + footer ────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=6))
    story.append(Paragraph(
        "This analysis was generated by DealFlow AI and is for demonstration purposes only. "
        "It does not constitute investment advice, financial guidance, or a formal deal opinion. "
        "All valuations are AI-estimated and should not be relied upon for actual transactions.",
        st["footer"]
    ))

    doc.build(story)
    print(f"PDF written to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: pdf_export.py '<json>' '<output_path>'")
        sys.exit(1)
    data = json.loads(sys.argv[1])
    build_pdf(data, sys.argv[2])
