from __future__ import annotations

from pathlib import Path

from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "docs" / "assets"
OUTPUT_DIR = ROOT / "output" / "pdf"
PDF_PATH = OUTPUT_DIR / "AgentCare_Local_Setup_Guide.pdf"
OG_PATH = ROOT / "public" / "og.png"
FLOW_PATH = ASSET_DIR / "local-runtime-flow.png"
MAP_PATH = ASSET_DIR / "setup-validation-map.png"
AGENTIC_PATH = ASSET_DIR / "agentic-ai-execution-flow.png"

GREEN = colors.HexColor("#063D35")
GREEN_2 = colors.HexColor("#0C5A4C")
MINT = colors.HexColor("#DCECE4")
PALE = colors.HexColor("#F2F7F3")
GOLD = colors.HexColor("#D59B28")
INK = colors.HexColor("#18312D")
MUTED = colors.HexColor("#5B706B")
WHITE = colors.white
RED = colors.HexColor("#A33D3D")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def rounded_box(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], fill: str, outline: str, radius: int = 26, width: int = 3) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, text_font, fill: str) -> None:
    left, top, right, bottom = box
    bbox = draw.multiline_textbbox((0, 0), text, font=text_font, align="center", spacing=6)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    draw.multiline_text(
        ((left + right - width) / 2, (top + bottom - height) / 2),
        text,
        font=text_font,
        fill=fill,
        align="center",
        spacing=6,
    )


def make_flow_image() -> None:
    canvas = PILImage.new("RGB", (1600, 900), "#F4F8F5")
    draw = ImageDraw.Draw(canvas)
    title_font = font(48, bold=True)
    label_font = font(28, bold=True)
    small_font = font(21)
    draw.text((80, 52), "AgentCare local runtime", font=title_font, fill="#063D35")
    draw.text((82, 116), "Agents propose. Policies authorize. Services execute. SQL proves.", font=small_font, fill="#5B706B")

    boxes = [
        ((70, 250, 310, 510), "Browser UI\nlocalhost:3000", "#FFFFFF"),
        ((380, 210, 670, 550), "FastAPI\nlocalhost:8000\n\nJWT + RBAC", "#E4F0E8"),
        ((740, 170, 1070, 590), "Agentic harness\n\nSafety\nRouting\nAppointment\nDocument\nFollow-up", "#DCECE4"),
        ((1140, 210, 1530, 550), "Authoritative services\n\nRAG evidence\nMCP tools\nSQLite\nUploads + audit", "#FFFFFF"),
    ]
    for box, text, fill in boxes:
        rounded_box(draw, box, fill, "#0C5A4C")
        centered_text(draw, box, text, label_font if "\n\n" not in text else small_font, "#18312D")

    for x1, x2, y in [(310, 380, 380), (670, 740, 380), (1070, 1140, 380)]:
        draw.line((x1, y, x2 - 16, y), fill="#D59B28", width=8)
        draw.polygon([(x2 - 18, y - 14), (x2, y), (x2 - 18, y + 14)], fill="#D59B28")

    optional = (650, 680, 1010, 820)
    rounded_box(draw, optional, "#FFF9E8", "#D59B28", radius=22)
    centered_text(draw, optional, "Optional OpenAI proposal\nLLM_ENABLED=true\nDeveloper-owned API key", small_font, "#654A13")
    draw.line((855, 680, 885, 596), fill="#D59B28", width=5)
    draw.polygon([(874, 610), (885, 590), (891, 614)], fill="#D59B28")

    draw.text((80, 790), "Clinical decisions remain human-controlled. The LLM never writes SQL or authorizes a transaction.", font=small_font, fill="#A33D3D")
    canvas.save(FLOW_PATH, quality=94)


def make_validation_map() -> None:
    canvas = PILImage.new("RGB", (1600, 520), "#063D35")
    draw = ImageDraw.Draw(canvas)
    title_font = font(42, bold=True)
    step_font = font(24, bold=True)
    small_font = font(18)
    draw.text((70, 42), "Clone-to-running-system path", font=title_font, fill="#FFFFFF")
    steps = [
        ("1", "Clone", "main branch"),
        ("2", "Configure", "local .env"),
        ("3", "Seed", "synthetic SQL"),
        ("4", "Start", "API + web"),
        ("5", "Verify", "journeys + roles"),
        ("6", "Test", "Python + web"),
    ]
    x = 70
    for index, (number, label, sub) in enumerate(steps):
        box = (x, 170, x + 205, 390)
        rounded_box(draw, box, "#F2F7F3", "#9AC8B3", radius=24, width=3)
        draw.ellipse((x + 72, 190, x + 133, 251), fill="#D59B28")
        centered_text(draw, (x + 72, 190, x + 133, 251), number, step_font, "#063D35")
        centered_text(draw, (x + 15, 260, x + 190, 318), label, step_font, "#18312D")
        centered_text(draw, (x + 15, 322, x + 190, 365), sub, small_font, "#5B706B")
        if index < len(steps) - 1:
            draw.line((x + 210, 280, x + 245, 280), fill="#D59B28", width=6)
            draw.polygon([(x + 245, 280), (x + 229, 269), (x + 229, 291)], fill="#D59B28")
        x += 250
    draw.text((70, 450), "Ready means: health OK, roles verified, workflows persisted, safety enforced, and tests green.", font=small_font, fill="#DCECE4")
    canvas.save(MAP_PATH, quality=94)


def make_agentic_image() -> None:
    canvas = PILImage.new("RGB", (1600, 900), "#063D35")
    draw = ImageDraw.Draw(canvas)
    title_font = font(45, bold=True)
    label_font = font(22, bold=True)
    small_font = font(17)
    draw.text((70, 45), "Evidence-gated agentic execution", font=title_font, fill="#FFFFFF")
    draw.text(
        (72, 108),
        "Probabilistic proposals are separated from policy authority and transactional execution.",
        font=small_font,
        fill="#DCECE4",
    )

    top = [
        ((70, 205, 320, 410), "Patient request\n+ identity", "#F2F7F3"),
        ((390, 205, 650, 410), "Coordinator\npersisted state\n+ checkpoint", "#DCECE4"),
        ((720, 205, 990, 410), "LLM proposals\nSafety + Intent\nor Routing", "#FFF9E8"),
        ((1060, 205, 1530, 410), "RAG evidence\nversioned chunks\n+ citations", "#F2F7F3"),
    ]
    bottom = [
        ((180, 555, 480, 770), "Deterministic\npolicy gate\n+ human threshold", "#DCECE4"),
        ((560, 555, 880, 770), "MCP typed tools\nread + authorized\nmutations", "#F2F7F3"),
        ((960, 555, 1260, 770), "Atomic SQL / D1\nbooking, documents,\naudit evidence", "#DCECE4"),
        ((1340, 555, 1530, 770), "Human\nreview", "#FFF0E8"),
    ]
    for box, text, fill in [*top, *bottom]:
        rounded_box(draw, box, fill, "#9AC8B3", radius=24, width=3)
        centered_text(draw, box, text, label_font, "#18312D")

    for x1, x2 in [(320, 390), (650, 720), (990, 1060)]:
        draw.line((x1, 308, x2 - 17, 308), fill="#D59B28", width=7)
        draw.polygon([(x2 - 18, 294), (x2, 308), (x2 - 18, 322)], fill="#D59B28")
    draw.line((1295, 410, 1295, 485), fill="#D59B28", width=7)
    draw.line((1295, 485, 330, 485), fill="#D59B28", width=7)
    draw.line((330, 485, 330, 538), fill="#D59B28", width=7)
    draw.polygon([(316, 537), (330, 555), (344, 537)], fill="#D59B28")
    for x1, x2 in [(480, 560), (880, 960), (1260, 1340)]:
        draw.line((x1, 662, x2 - 17, 662), fill="#D59B28", width=7)
        draw.polygon([(x2 - 18, 648), (x2, 662), (x2 - 18, 676)], fill="#D59B28")

    draw.text(
        (70, 830),
        "Observable proof: agent proposal + RAG reference + MCP trace + policy decision + committed record.",
        font=small_font,
        fill="#DCECE4",
    )
    canvas.save(AGENTIC_PATH, quality=94)


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=27, leading=32, textColor=GREEN, alignment=TA_LEFT,
            spaceAfter=10,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", parent=base["Normal"], fontName="Helvetica",
            fontSize=12, leading=17, textColor=MUTED, spaceAfter=14,
        ),
        "h1": ParagraphStyle(
            "H1", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=19, leading=23, textColor=GREEN, spaceBefore=7,
            spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=13.5, leading=17, textColor=GREEN_2, spaceBefore=8,
            spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="Helvetica",
            fontSize=9.3, leading=13.2, textColor=INK, spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "Small", parent=base["BodyText"], fontName="Helvetica",
            fontSize=7.8, leading=10.5, textColor=MUTED, spaceAfter=4,
        ),
        "bullet": ParagraphStyle(
            "Bullet", parent=base["BodyText"], fontName="Helvetica",
            fontSize=9.1, leading=12.8, textColor=INK, leftIndent=13,
            firstLineIndent=-7, bulletIndent=4, spaceAfter=3,
        ),
        "code": ParagraphStyle(
            "Code", parent=base["Code"], fontName="Courier",
            fontSize=7.5, leading=10, textColor=INK, leftIndent=8,
            rightIndent=8, spaceBefore=3, spaceAfter=7,
            backColor=colors.HexColor("#EDF3EF"), borderColor=colors.HexColor("#C6D8CF"),
            borderWidth=0.5, borderPadding=7,
        ),
        "callout": ParagraphStyle(
            "Callout", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=9.3, leading=13, textColor=GREEN, leftIndent=9,
            rightIndent=9, spaceBefore=5, spaceAfter=8, backColor=MINT,
            borderColor=GREEN_2, borderWidth=0.6, borderPadding=8,
        ),
        "danger": ParagraphStyle(
            "Danger", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=9.1, leading=13, textColor=RED, leftIndent=9,
            rightIndent=9, spaceBefore=5, spaceAfter=8,
            backColor=colors.HexColor("#FBEFEF"), borderColor=RED,
            borderWidth=0.6, borderPadding=8,
        ),
        "center": ParagraphStyle(
            "Center", parent=base["BodyText"], fontName="Helvetica",
            fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER,
        ),
    }


def P(text: str, style) -> Paragraph:
    return Paragraph(text, style)


def B(text: str, style) -> Paragraph:
    return Paragraph(f"- {text}", style)


def C(text: str, style) -> Preformatted:
    return Preformatted(text.strip(), style)


def section_title(number: str, title: str, style) -> Paragraph:
    return P(f"{number}. {title}", style)


def table(data, widths, header=True, font_size=7.7):
    result = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#B9CBC2")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("BACKGROUND", (0, 1 if header else 0), (-1, -1), WHITE),
    ]
    if header:
        commands += [
            ("BACKGROUND", (0, 0), (-1, 0), GREEN),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    for row in range(1 if header else 0, len(data)):
        if row % 2 == 0:
            commands.append(("BACKGROUND", (0, row), (-1, row), PALE))
    result.setStyle(TableStyle(commands))
    return result


def wrapped_table(data, widths, font_size=6.55):
    body_style = ParagraphStyle(
        "WrappedTableBody",
        fontName="Helvetica",
        fontSize=font_size,
        leading=font_size + 2,
        textColor=INK,
        spaceAfter=0,
    )
    header_style = ParagraphStyle(
        "WrappedTableHeader",
        fontName="Helvetica-Bold",
        fontSize=font_size,
        leading=font_size + 2,
        textColor=WHITE,
        spaceAfter=0,
    )
    prepared = [
        [Paragraph(str(cell), header_style if row_index == 0 else body_style) for cell in row]
        for row_index, row in enumerate(data)
    ]
    result = Table(prepared, colWidths=widths, hAlign="LEFT", repeatRows=1)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#B9CBC2")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
    ]
    for row in range(1, len(prepared)):
        commands.append(
            ("BACKGROUND", (0, row), (-1, row), PALE if row % 2 == 0 else WHITE)
        )
    result.setStyle(TableStyle(commands))
    return result


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(colors.HexColor("#B8CFC4"))
    canvas.setLineWidth(0.4)
    canvas.line(18 * mm, height - 14 * mm, width - 18 * mm, height - 14 * mm)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.setFillColor(GREEN)
    canvas.drawString(18 * mm, height - 10.5 * mm, "AgentCare Local Setup Guide")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 18 * mm, height - 10.5 * mm, "Developer and evaluator edition")
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.drawString(18 * mm, 9.5 * mm, "Synthetic demonstration system - no clinical decision support")
    canvas.drawRightString(width - 18 * mm, 9.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def image_scaled(path: Path, max_width: float, max_height: float) -> Image:
    with PILImage.open(path) as img:
        width, height = img.size
    scale = min(max_width / width, max_height / height)
    return Image(str(path), width=width * scale, height=height * scale)


def build_pdf() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    s = styles()
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=19 * mm,
        title="AgentCare Local Setup Guide",
        author="AgentCare",
        subject="Clone, configure, run, verify, and test AgentCare locally",
    )
    story = []

    story += [
        Spacer(1, 2 * mm),
        image_scaled(OG_PATH, 174 * mm, 96 * mm),
        Spacer(1, 7 * mm),
        P("AgentCare Local Setup Guide", s["title"]),
        P("Clone, configure, run, verify, and test the complete evidence-gated patient administration platform.", s["subtitle"]),
        HRFlowable(width="100%", thickness=1.2, color=GOLD, spaceBefore=2, spaceAfter=12),
        table(
            [
                ["Repository", "github.com/chinmayk1613/AgentCare_AI_Patient_Administration_and_Care_Coordination"],
                ["Branch", "main"],
                ["Recommended route", "Docker Compose"],
                ["Native stack", "Python 3.11/3.12 + Node.js 22.13+ + pnpm 11.9"],
                ["LLM", "Optional developer-owned OpenAI key; safe fallback works without one"],
            ],
            [37 * mm, 129 * mm],
            header=False,
            font_size=8.1,
        ),
        Spacer(1, 8 * mm),
        P("Agents propose. Policies authorize. Services execute. SQL proves. Humans decide exceptions.", s["callout"]),
        P("Version 1.0 - July 28, 2026", s["center"]),
        PageBreak(),
    ]

    story += [
        section_title("1", "What a new developer needs", s["h1"]),
        P("Choose the Docker route for the fastest complete startup. Choose the native route when editing or debugging the Python and TypeScript services separately.", s["body"]),
        table(
            [
                ["Path", "Required software", "Best for"],
                ["Docker - recommended", "Git + Docker Desktop + Compose", "Fast, isolated, complete startup"],
                ["Native development", "Git + Python 3.11/3.12 + Node 22.13+ + pnpm 11.9", "Editing and debugging"],
            ],
            [38 * mm, 69 * mm, 59 * mm],
        ),
        Spacer(1, 5 * mm),
        B("Optional OpenAI API key with active billing/quota for real LLM proposals.", s["bullet"]),
        B("Editor such as VS Code.", s["bullet"]),
        B("Synthetic document under 10 MB for upload tests.", s["bullet"]),
        P("No OpenAI key is required to exercise persistence, RAG retrieval, MCP tools, policy gates, booking, documents, human review, and audit evidence. The explicit safe-fallback path remains end-to-end.", s["callout"]),
        section_title("2", "Local architecture", s["h1"]),
        image_scaled(FLOW_PATH, 170 * mm, 91 * mm),
        P("The browser calls FastAPI locally. The backend owns JWT/RBAC, agents, RAG, MCP-style tools, SQLite transactions, uploads, and audit events. Only bounded proposals may use OpenAI.", s["small"]),
        PageBreak(),
    ]

    story += [
        section_title("2A", "Why this is an agentic AI project", s["h1"]),
        P(
            "AgentCare is a persisted, evidence-gated multi-agent workflow - not one chatbot prompt around an appointment form. The coordinator advances durable checkpoints; specialist agents propose or invoke bounded tools; policies and humans authorize; committed records establish truth.",
            s["body"],
        ),
        image_scaled(AGENTIC_PATH, 170 * mm, 76 * mm),
        Spacer(1, 4 * mm),
        table(
            [
                ["Agent", "Purpose", "Boundary"],
                ["Coordinator", "State graph, hand-offs, truthful status", "Workflow/checkpoints only"],
                ["Safety", "Emergency and clinical-boundary gate", "Escalate + audit"],
                ["Intent", "Hosted book/reschedule/cancel proposal", "Structured proposal only"],
                ["Routing", "Evidence-grounded department proposal", "RAG, lookup, escalation"],
                ["Appointment", "Search/book/cancel/reschedule", "Typed tools + atomic SQL"],
                ["Document", "Type, dedupe, security, requirements", "No clinical interpretation"],
                ["Follow-up", "Reminders and administrative tasks", "Committed records only"],
            ],
            [34 * mm, 69 * mm, 63 * mm],
            font_size=7.0,
        ),
        Spacer(1, 5 * mm),
        P(
            "Python: backend/app/agents.py + orchestrator.py. Hosted: app/api/_agentic.ts + workflows/[workflowId]/advance/route.ts.",
            s["callout"],
        ),
        PageBreak(),
    ]

    story += [
        section_title("2B", "Exact use of LLM, RAG, MCP, and fine-tuning", s["h1"]),
        wrapped_table(
            [
                ["Capability", "Exact implementation", "Purpose"],
                [
                    "LLM - Python",
                    "openai-agents==0.2.10; Agent + Runner.run_sync; OPENAI_MODEL defaults to gpt-5-mini; max 3 turns",
                    "Structured Safety and Routing proposals",
                ],
                [
                    "LLM - hosted",
                    "Direct fetch to OpenAI Responses API; strict JSON schema; deployment model gpt-5-mini",
                    "Structured Safety and Intent proposals",
                ],
                [
                    "RAG",
                    "Versioned policy chunks; 128D local semantic hash; D1/SQL; cosine 45% + concepts 40% + lexical 15%",
                    "Ground routing, providers, document rules, and guardrails",
                ],
                [
                    "MCP - Python",
                    "mcp==1.12.3 FastMCP: departments, approved policy, available slots",
                    "Typed read boundary over hospital services",
                ],
                [
                    "MCP - hosted",
                    "JSON-RPC 2025-06-18: policy, RAG manifest, departments, slots, booking, cancel, reschedule, documents",
                    "Audited read/write tool calls after authorization",
                ],
                [
                    "Fine-tuning",
                    "Optional OPENAI_FINE_TUNED_MODEL; only validated ft:* IDs; none currently claimed",
                    "Future task consistency - never policy or authorization",
                ],
            ],
            [31 * mm, 86 * mm, 49 * mm],
            font_size=6.55,
        ),
        Spacer(1, 4 * mm),
        P("Where the LLM is used", s["h2"]),
        P(
            "When a patient submits a free-text request, the LLM helps the Safety Agent identify potential emergency or prohibited clinical language, the hosted Intent Agent classify booking, rescheduling, or cancellation, and the Routing Agent propose a hospital department using retrieved RAG evidence. The result is only a structured proposal; policy gates, human-review thresholds, MCP tools, and committed SQL records determine and prove the final action.",
            s["callout"],
        ),
        P("RAG behavior", s["h2"]),
        B("Catalog, terminology, document rules, providers, and guardrails are parsed and chunked.", s["bullet"]),
        B("Evidence references include policy key, version, and chunk number.", s["bullet"]),
        B("Live slots are excluded from RAG and queried transactionally through MCP.", s["bullet"]),
        P("Fine-tuning truth", s["h2"]),
        P(
            "The current project uses a base model or deterministic fallback. A fine-tuned model is not required and is not falsely claimed. Policies, slots, authorization, and safety thresholds stay in RAG, MCP/SQL, and deterministic code.",
            s["danger"],
        ),
        P("Reviewer-visible proof", s["h2"]),
        B("agent_proposals: agent, decision, confidence, model, execution mode.", s["bullet"]),
        B("RAG: chunk ID, policy version, score, excerpt, embedding model.", s["bullet"]),
        B("MCP: server, transport, tool, input/output, status, timestamp.", s["bullet"]),
        B("Audit + SQL/D1: checkpoints, escalations, human decisions, committed records.", s["bullet"]),
        PageBreak(),
    ]

    story += [
        section_title("3", "Clone and inspect", s["h1"]),
        P("Windows PowerShell, macOS, or Linux:", s["body"]),
        C(
            """
git clone https://github.com/chinmayk1613/AgentCare_AI_Patient_Administration_and_Care_Coordination.git
cd AgentCare_AI_Patient_Administration_and_Care_Coordination
git switch main
git status
            """,
            s["code"],
        ),
        P("Expected: branch main, clean working tree, and no real .env file or credential.", s["callout"]),
        section_title("4", "Recommended route - Docker Compose", s["h1"]),
        P("<b>Step 1 - Verify Docker Desktop is running</b>", s["h2"]),
        C("docker --version\ndocker compose version", s["code"]),
        P("<b>Step 2 - Create the ignored local environment</b>", s["h2"]),
        C("Copy-Item .env.example .env    # Windows PowerShell\ncp .env.example .env           # macOS/Linux", s["code"]),
        C(
            """
JWT_SECRET=replace-with-a-long-random-local-secret
LLM_ENABLED=false
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
            """,
            s["code"],
        ),
        P("<b>Step 3 - Build and start</b>", s["h2"]),
        C("docker compose up --build", s["code"]),
        B("API: http://localhost:8000", s["bullet"]),
        B("Web: http://localhost:3000", s["bullet"]),
        B("API docs: http://localhost:8000/docs", s["bullet"]),
        B("Persistent local volume: agentcare_data", s["bullet"]),
        P("<b>Step 4 - Verify health</b>", s["h2"]),
        C('curl http://localhost:8000/health\n# {"status":"ok","llm_mode":"safe-fallback","write_tools":true}', s["code"]),
        PageBreak(),
    ]

    story += [
        section_title("4", "Docker lifecycle and reset", s["h1"]),
        P("Stop while preserving the synthetic database and uploads:", s["body"]),
        C("docker compose down", s["code"]),
        P("Restart without rebuilding:", s["body"]),
        C("docker compose up", s["code"]),
        P("Delete only the local Docker volume and reseed:", s["body"]),
        C("docker compose down -v\ndocker compose up --build", s["code"]),
        P("The -v command destroys the local AgentCare volume. Do not use it against important data.", s["danger"]),
        section_title("5", "Native backend setup", s["h1"]),
        P("<b>Step 1 - Verify runtimes</b>", s["h2"]),
        C("git --version\npython --version\nnode --version\npnpm --version", s["code"]),
        P("Expected: Python 3.11 or 3.12, Node.js 22.13+, and pnpm 11.9.", s["body"]),
        P("<b>Step 2 - Create a virtual environment</b>", s["h2"]),
        C(
            """
# Windows PowerShell
python -m venv .venv
./.venv/Scripts/Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# macOS/Linux
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
            """,
            s["code"],
        ),
        P("<b>Step 3 - Copy backend environment template</b>", s["h2"]),
        C("Copy-Item backend\\.env.example backend\\.env    # Windows\ncp backend/.env.example backend/.env             # macOS/Linux", s["code"]),
        PageBreak(),
    ]

    story += [
        section_title("5", "Native services", s["h1"]),
        P("Recommended backend/.env values:", s["body"]),
        C(
            """
APP_ENV=development
DATABASE_URL=sqlite:///./data/agentcare.db
JWT_SECRET=replace-with-a-long-random-local-secret
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
LLM_ENABLED=false
UPLOAD_DIR=./data/uploads
MAX_UPLOAD_MB=10
WRITE_TOOLS_ENABLED=true
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
            """,
            s["code"],
        ),
        P("<b>Step 4 - Seed and start FastAPI</b>", s["h2"]),
        C(
            """
cd backend
python -m app.seed
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
            """,
            s["code"],
        ),
        P("Expected: backend/data/agentcare.db, synthetic hospital data, and HTTP 200 from /health.", s["callout"]),
        P("<b>Step 5 - Start the web interface in a second terminal</b>", s["h2"]),
        C("pnpm install --frozen-lockfile\npnpm run dev", s["code"]),
        P("Open http://localhost:3000. Localhost defaults to the API at http://127.0.0.1:8000.", s["body"]),
        section_title("6", "Optional OpenAI LLM", s["h1"]),
        C("LLM_ENABLED=true\nOPENAI_API_KEY=your-own-key-here\nOPENAI_MODEL=gpt-5-mini", s["code"]),
        P("Restart FastAPI. The /health response should show llm_mode: enabled. Each developer must use an authorized key with active quota.", s["body"]),
        P("Never commit or share an API key. A provider error returns the workflow to the safe-fallback path. The model never authorizes SQL writes or clinical decisions.", s["danger"]),
        PageBreak(),
    ]

    story += [
        section_title("7", "Synthetic accounts", s["h1"]),
        table(
            [
                ["Role", "Email", "Password"],
                ["Patient - Chinmay Kashikar", "chinmay.kashikar@agentcare.demo", "Patient123!"],
                ["Patient - Mayuresh Kashikar", "mayuresh.kashikar@agentcare.demo", "Patient123!"],
                ["Staff - Dr Vikas Jha", "vikas.jha@agentcare.demo", "Reviewer123!"],
                ["Staff - Dr Arunima Gosavi", "arunima.gosavi@agentcare.demo", "Reviewer123!"],
            ],
            [42 * mm, 78 * mm, 46 * mm],
            font_size=7.4,
        ),
        Spacer(1, 6 * mm),
        P(
            "Demonstration only - not for clinical use. Use synthetic data only; never enter or upload real PHI. Public-demo uploads require confirmation, are rate-limited, and accept PDF, PNG, JPEG, or TXT up to 10 MB.",
            s["danger"],
        ),
        PageBreak(),
        section_title("8", "End-to-end verification", s["h1"]),
        image_scaled(MAP_PATH, 170 * mm, 55 * mm),
        P("<b>A. Normal journey</b> - Sign in as the patient and submit:", s["h2"]),
        C("I need a cardiology follow-up next week. I also want to attach my previous ECG.", s["code"]),
        B("Confirm stepwise safety, intent, RAG/MCP routing, live slot selection, appointment commit, document validation, reminder, case number, and audit evidence.", s["bullet"]),
        P("<b>B. Human approval</b> - Submit:", s["h2"]),
        C("My legs are painful. I need to consult a doctor and submit my MRI report.", s["code"]),
        B("Confirm staff review opens case details, approval resumes the same workflow, and live availability follows.", s["bullet"]),
        P("<b>C. Document mismatch</b> - Require MRI, upload a synthetic ECG, and verify MRI stays missing with a warning.", s["body"]),
        P("<b>D. Safety boundary</b> - Ask for diagnosis/prescription and verify escalation without clinical advice.", s["body"]),
        PageBreak(),
    ]

    story += [
        section_title("9", "Automated tests", s["h1"]),
        C(
            """
cd backend
python -m pytest
cd ..

pnpm run lint
pnpm run build
node --test tests/rendered-html.test.mjs
            """,
            s["code"],
        ),
        B("Python source compiles and backend tests pass.", s["bullet"]),
        B("Persistence, idempotency, safety, and RBAC behavior pass.", s["bullet"]),
        B("TypeScript lint and Cloudflare Worker build pass.", s["bullet"]),
        B("Rendered interface test confirms the real AgentCare product and hosted API.", s["bullet"]),
        section_title("10", "Update an existing clone", s["h1"]),
        C(
            """
git status
git pull --ff-only origin main
python -m pip install -r requirements.txt
pnpm install --frozen-lockfile
            """,
            s["code"],
        ),
        P("For Docker, use docker compose up --build after pulling changes.", s["body"]),
        section_title("11", "Security and data rules", s["h1"]),
        B("Never commit .env, credentials, patient documents, local databases, uploads, or logs.", s["bullet"]),
        B("Use synthetic or properly anonymized data only.", s["bullet"]),
        B("Rotate a key immediately if it appears in chat, logs, screenshots, or Git history.", s["bullet"]),
        B("Replace demo JWT login with approved OIDC/OAuth 2.1 before non-demo use.", s["bullet"]),
        B("The system is administrative; it must not diagnose, prescribe, dose, or interpret findings.", s["bullet"]),
        C('git status\ngit diff --check\ngit grep -n "OPENAI_API_KEY="', s["code"]),
        PageBreak(),
    ]

    trouble_rows = [
        ["Symptom", "Likely check", "Resolution"],
        ["Backend offline", "/health on port 8000", "Start API; verify API base URL"],
        ["Port conflict", "Local process/container", "Stop conflict or update URLs/origins together"],
        ["Login fails", "Seeded database", "Run app.seed or recreate local Docker volume"],
        ["LLM stays fallback", "Flag, key, quota, restart", "Set both values; use active quota; restart"],
        ["Upload fails", "Size/type/directory", "Use synthetic file under 10 MB; check write access"],
        ["CORS error", "Allowed origins/API URL", "Use localhost origins and matching API base"],
        ["No slot", "Seed/bookings", "Use another specialty/date or fresh local database"],
        ["Build failure", "Node/pnpm/lockfile", "Use Node 22.13+ and frozen install"],
        ["CI syntax mismatch", "Python version", "Use Python 3.11/3.12; run tests"],
    ]
    story += [
        section_title("12", "Troubleshooting", s["h1"]),
        table(trouble_rows, [45 * mm, 48 * mm, 73 * mm], font_size=6.8),
        Spacer(1, 7 * mm),
        section_title("13", "Completion checklist", s["h1"]),
        table(
            [
                ["Check", "Pass condition"],
                ["Repository", "main selected; clean; no secrets"],
                ["Configuration", "Ignored local .env files created"],
                ["Database", "Synthetic seed completed"],
                ["API", "/health returns status: ok"],
                ["Web", "Port 3000 opens and patient login works"],
                ["Roles", "Staff/reviewer case access works"],
                ["Workflow", "Normal journey reaches slot confirmation"],
                ["Human review", "Paused case resumes after approval"],
                ["Documents", "Mismatch remains missing and warns"],
                ["Safety", "Clinical request escalates without advice"],
                ["Tests", "Backend, lint, build, and UI tests pass"],
            ],
            [51 * mm, 115 * mm],
            font_size=7.2,
        ),
        Spacer(1, 8 * mm),
        P("When every row passes, the clone is ready for development or evaluation.", s["callout"]),
        P("Repository: https://github.com/chinmayk1613/AgentCare_AI_Patient_Administration_and_Care_Coordination", s["small"]),
    ]

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    reader = PdfReader(str(PDF_PATH))
    if len(reader.pages) < 10:
        raise RuntimeError("Generated guide is unexpectedly short")
    if not (reader.metadata and reader.metadata.title == "AgentCare Local Setup Guide"):
        raise RuntimeError("PDF metadata validation failed")


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    make_flow_image()
    make_validation_map()
    make_agentic_image()
    build_pdf()
    print(PDF_PATH)


if __name__ == "__main__":
    main()
