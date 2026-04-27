from anthropic import Anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import get_settings


def _client() -> Anthropic:
    return Anthropic(api_key=get_settings().ANTHROPIC_API_KEY)


@retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=4))
def complete(
    system: str,
    messages: list[dict],
    *,
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> str:
    """Call Claude and return the text content of the first text block."""
    settings = get_settings()
    resp = _client().messages.create(
        model=settings.CLAUDE_MODEL,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    if not parts:
        raise ValueError("Claude returned an empty response (no text blocks)")
    return "".join(parts).strip()


SUMMARY_SYSTEM = (
    "You are a research assistant. Given the text of an academic paper, "
    "produce exactly five sentences that summarise: (1) the problem, "
    "(2) the proposed approach, (3) the key result, (4) the main "
    "limitation, and (5) why it matters. Plain prose, no bullets, no "
    "headings. Do not invent details that are not in the text."
)


def summarize_paper(title: str | None, body: str) -> str:
    snippet = body[:18000]
    user = (
        f"Title: {title or 'unknown'}\n\n"
        f"Paper text (truncated):\n{snippet}\n\n"
        "Write the five-sentence summary now."
    )
    return complete(
        system=SUMMARY_SYSTEM,
        messages=[{"role": "user", "content": user}],
        max_tokens=400,
    )


CHAT_SYSTEM = (
    "You are Alphex, a research assistant grounded in the user's personal "
    "paper library. Use the provided context snippets to answer accurately. "
    "Each snippet is tagged like [S1], [S2] — cite them inline when you draw "
    "on them, e.g. 'Transformers outperform RNNs [S2].' "
    "If the snippets only partially cover the question, answer what you can "
    "from the context and note what is not covered, rather than refusing "
    "entirely. Never fabricate citations or invent numbers not in the context."
)


def chat_with_context(question: str, context_blocks: list[str], history: list[dict]) -> str:
    context = "\n\n".join(context_blocks) if context_blocks else "(no relevant snippets found)"
    messages = list(history) + [
        {
            "role": "user",
            "content": (
                f"Context:\n{context}\n\n"
                f"Question: {question}\n\n"
                "Answer using only the context. Cite snippets inline like [S1]."
            ),
        }
    ]
    return complete(
        system=CHAT_SYSTEM,
        messages=messages,
        max_tokens=1200,
        temperature=0.3,
    )


GRAPH_SYSTEM = (
    "You write small, self-contained Python scripts that produce a single "
    "matplotlib figure and save it to the path given by the OUT environment "
    "variable. Constraints: stdlib + numpy + matplotlib only; never import "
    "anything else; no network or filesystem access beyond OUT; no input(); "
    "no plt.show(); end with plt.savefig(os.environ['OUT'], dpi=150, "
    "bbox_inches='tight'). Output ONLY the code, no markdown fences."
)


PAPER_CHART_SYSTEM = """You are a data visualization expert analyzing academic papers.

Given numbered paper chunks, identify 2-3 distinct quantitative findings, comparisons, or trends and write a matplotlib script for each.

Return EXACTLY this format (no markdown, no extra text):

CHART_START
TITLE: <short chart title>
EXPLANATION: <1-2 sentences: what this shows and the key insight>
SOURCES: <comma-separated chunk labels where you found the data, e.g. "Chunk 2, Chunk 5">
CODE:
<python code>
CHART_END

Rules for each CODE block:
- Use only numpy and matplotlib.pyplot (already imported as np and plt)
- os is imported; read output path from os.environ['OUT']
- Style: white background, dark text/labels (#18181b), use slate (#334155) or blue (#3b82f6) for bars/lines
- fig.patch.set_facecolor('white'); ax.set_facecolor('#f8f8f8')
- plt.savefig(os.environ['OUT'], dpi=150, bbox_inches='tight', facecolor='white')
- No plt.show(), no imports, no network or file access except os.environ['OUT']
- If exact numbers aren't stated, use illustrative data and add "(Illustrative)" to the title
- Include meaningful axis labels and a legend if needed"""


def analyze_paper_for_charts(title: str, chunks: list[dict]) -> list[dict]:
    """Return a list of {title, explanation, sources, code} dicts from paper content.

    chunks: list of {content, chunk_index, page} dicts
    """
    labeled = []
    for i, c in enumerate(chunks[:20]):
        page_str = f" (p.{c['page']})" if c.get("page") else ""
        labeled.append(f"[Chunk {i + 1}{page_str}]\n{c['content']}")
    context = "\n\n---\n\n".join(labeled)
    user = (
        f"Paper: {title}\n\n"
        f"Excerpts:\n{context}\n\n"
        "Generate 2-3 charts based on quantitative data or comparisons in this paper. "
        "Cite the chunk label(s) where you found each dataset."
    )
    raw = complete(
        system=PAPER_CHART_SYSTEM,
        messages=[{"role": "user", "content": user}],
        max_tokens=3000,
        temperature=0.2,
    )

    charts = []
    for block in raw.split("CHART_START"):
        block = block.strip()
        if "CHART_END" not in block:
            continue
        block = block[:block.index("CHART_END")].strip()
        try:
            title_line = next(l for l in block.splitlines() if l.startswith("TITLE:"))
            exp_line = next(l for l in block.splitlines() if l.startswith("EXPLANATION:"))
            src_lines = [l for l in block.splitlines() if l.startswith("SOURCES:")]
            sources = src_lines[0].replace("SOURCES:", "").strip() if src_lines else ""
            code_start = block.index("CODE:") + len("CODE:")
            code = block[code_start:].strip()
            charts.append({
                "title": title_line.replace("TITLE:", "").strip(),
                "explanation": exp_line.replace("EXPLANATION:", "").strip(),
                "sources": sources,
                "code": code,
            })
        except (StopIteration, ValueError):
            continue
    return charts


ANNOTATION_SYSTEM = (
    "You are an academic reading assistant. Given text from a research paper, "
    "identify technical terms, jargon, acronyms, and concepts a non-expert reader "
    "might not understand.\n\n"
    "Return ONLY lines in this exact format — no extra text:\n"
    "TERM: <exact term as it appears in the text>\n"
    "DEF: <concise 1-sentence plain-English definition>\n\n"
    "Rules: max 15 terms; only include terms that actually appear in the provided text; "
    "prioritise acronyms, model names, and field-specific jargon."
)


def generate_annotations(title: str, chunks: list[str]) -> list[dict]:
    """Return [{term, definition}] for hard terms found in the paper."""
    context = "\n\n---\n\n".join(chunks[:10])
    user = f"Paper: {title}\n\nText:\n{context}"
    raw = complete(
        system=ANNOTATION_SYSTEM,
        messages=[{"role": "user", "content": user}],
        max_tokens=1000,
        temperature=0.1,
    )
    terms: list[dict] = []
    current: dict = {}
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("TERM:"):
            current = {"term": line[5:].strip()}
        elif line.startswith("DEF:") and current:
            current["definition"] = line[4:].strip()
            terms.append(current)
            current = {}
    return terms


TAGGING_SYSTEM = (
    "You are a research librarian. Given a paper title and abstract, generate "
    "4-7 concise lowercase tags that categorise the paper.\n\n"
    "Return ONLY the tags, one per line. No bullets, numbers, or explanation.\n"
    "Good tags: specific topics, methods, domains — e.g. 'transformers', "
    "'protein folding', 'reinforcement learning', 'computer vision'.\n"
    "Avoid: generic words like 'research', 'paper', 'study', 'analysis'."
)


def generate_tags(title: str, abstract: str) -> list[str]:
    """Return a list of lowercase tag strings for a paper."""
    user = f"Title: {title}\n\nAbstract: {abstract or '(none)'}"
    try:
        raw = complete(
            system=TAGGING_SYSTEM,
            messages=[{"role": "user", "content": user}],
            max_tokens=150,
            temperature=0.2,
        )
        return [t.strip().lower() for t in raw.splitlines() if t.strip()][:7]
    except Exception:
        return []


FORGE_SYSTEM = """You are a research writing assistant. Given raw notes and data, generate a structured research draft.

Return EXACTLY this format (no markdown, no extra text):

SECTION_START
TYPE: heading
CONTENT: <section heading text>
SECTION_END

SECTION_START
TYPE: text
CONTENT: <paragraph text — cite sources inline as [Source N] if paper excerpts were provided>
SECTION_END

SECTION_START
TYPE: chart_spec
CONTENT: <chart title>
DETAIL: <1-sentence explanation of what to chart>
DATA_HINT: <brief description of the data for the chart, e.g. "accuracy: GPT-4=94%, Claude=92%, Gemini=89%">
SECTION_END

Rules:
- Generate 4-8 sections total: one main heading, 3-5 text paragraphs, 1-2 chart_spec sections
- chart_spec sections describe charts; the caller will generate actual Python/matplotlib code from them
- Text must be grounded in the notes provided; do not invent results not present in the input
- Inline citations like [Source 1] refer to the numbered paper excerpts provided"""


def generate_forge_draft(title: str, notes: str, paper_contexts: list[str]) -> list[dict]:
    """Generate structured draft sections from user notes and paper context."""
    import uuid as _uuid
    ctx = ""
    if paper_contexts:
        ctx = "\n\nPaper excerpts for context:\n" + "\n\n".join(
            f"[Source {i + 1}]\n{c[:800]}" for i, c in enumerate(paper_contexts[:6])
        )
    user = (
        f"Draft title: {title or 'Untitled'}\n\n"
        f"My notes and data:\n{notes}\n"
        f"{ctx}\n\n"
        "Generate a structured draft based on these notes."
    )
    raw = complete(
        system=FORGE_SYSTEM,
        messages=[{"role": "user", "content": user}],
        max_tokens=2500,
        temperature=0.3,
    )

    sections: list[dict] = []
    for block in raw.split("SECTION_START"):
        block = block.strip()
        if "SECTION_END" not in block:
            continue
        block = block[:block.index("SECTION_END")].strip()
        lines = block.splitlines()
        fields: dict[str, str] = {}
        for line in lines:
            for key in ("TYPE", "CONTENT", "DETAIL", "DATA_HINT"):
                if line.startswith(f"{key}:"):
                    fields[key.lower()] = line[len(key) + 1:].strip()
        if not fields.get("type") or not fields.get("content"):
            continue
        sections.append({
            "id": str(_uuid.uuid4()),
            "type": fields["type"],
            "content": fields["content"],
            "detail": fields.get("detail", ""),
            "data_hint": fields.get("data_hint", ""),
            "comment": "",
        })
    return sections


LITERATURE_REVIEW_SYSTEM = """You are an expert academic writing assistant. Write a comprehensive literature review from the provided numbered sources.

Requirements:
- Open with a focused introductory paragraph establishing the research area and scope
- Group papers into 2–4 thematic sections with ## subheadings (do NOT use a ## Introduction heading — start prose directly)
- Within each theme, synthesise findings across multiple papers — do NOT summarise each paper individually in sequence
- Cite inline as [S1], [S2], [S3] or combined [S1, S3] matching the numbered sources provided
- End with a ## Research Gaps and Future Directions section grounded in the sources
- Write in formal, concise academic prose — 700–1000 words
- Return ONLY the review text in markdown. No preamble, no commentary, no fences."""


def generate_literature_review(papers: list[dict], focus: str) -> str:
    """Return a markdown literature review grounded in the provided papers."""
    sources = "\n\n".join(
        "[S{n}] {title}{year}\n{authors}{body}".format(
            n=i + 1,
            title=p.get("title", "Untitled"),
            year=f" ({p['year']})" if p.get("year") else "",
            authors=f"Authors: {', '.join((p.get('authors') or [])[:3])}\n" if p.get("authors") else "",
            body=p.get("summary") or p.get("abstract") or "(no summary available)",
        )
        for i, p in enumerate(papers[:20])
    )
    user = (
        f"Sources:\n{sources}\n\n"
        + (f"Focus: {focus}\n\n" if focus.strip() else "")
        + "Write the literature review now."
    )
    return complete(
        system=LITERATURE_REVIEW_SYSTEM,
        messages=[{"role": "user", "content": user}],
        max_tokens=2500,
        temperature=0.3,
    )


RESEARCH_QUESTIONS_SYSTEM = """You are a research methodology expert. Given paper summaries and optional topics, generate focused research questions, knowledge gaps, hypotheses, and a step-by-step procedure.

Return EXACTLY this format:

QUESTIONS_START
Q: <specific, answerable research question>
QUESTIONS_END

GAPS_START
GAP: <identified gap or limitation in current knowledge>
GAPS_END

HYPOTHESES_START
H: <testable hypothesis with clear independent and dependent variables>
HYPOTHESES_END

PROCEDURE_START
STEP: <numbered procedure step>
PROCEDURE_END

Rules:
- Generate 3-5 research questions grounded in the provided papers
- Identify 3-4 knowledge gaps
- Propose 2-3 testable hypotheses
- Outline 5-8 concrete procedure steps
- Incorporate user-provided topics if given; otherwise infer from papers
- Never invent results not present in the input"""


def _extract_tagged_items(text: str, tag: str, prefix: str) -> list[str]:
    """Extract lines starting with `prefix: ` from inside TAG_START / TAG_END blocks."""
    items: list[str] = []
    inside = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == f"{tag}_START":
            inside = True
            continue
        if stripped == f"{tag}_END":
            inside = False
            continue
        if inside and stripped.startswith(f"{prefix}: "):
            items.append(stripped[len(prefix) + 2:].strip())
    return items


def generate_research_questions(papers: list[dict], topics: str) -> dict:
    """Return {questions, gaps, hypotheses, procedure} from papers + topic keywords."""
    paper_context = "\n\n".join(
        f"Paper {i + 1}: {p.get('title', 'Untitled')}\n"
        f"Summary: {p.get('summary') or p.get('abstract') or '(none)'}"
        for i, p in enumerate(papers[:8])
    )
    user = (
        f"Papers in my library:\n{paper_context}\n\n"
        f"Research topics / focus: {topics or '(open-ended — infer from papers)'}\n\n"
        "Generate research questions, knowledge gaps, hypotheses, and a procedure."
    )
    raw = complete(
        system=RESEARCH_QUESTIONS_SYSTEM,
        messages=[{"role": "user", "content": user}],
        max_tokens=2000,
        temperature=0.4,
    )
    return {
        "questions": _extract_tagged_items(raw, "QUESTIONS", "Q"),
        "gaps": _extract_tagged_items(raw, "GAPS", "GAP"),
        "hypotheses": _extract_tagged_items(raw, "HYPOTHESES", "H"),
        "procedure": _extract_tagged_items(raw, "PROCEDURE", "STEP"),
    }


COMPARE_SYSTEM = """You are a research analyst. Compare two academic papers across key dimensions.

Return EXACTLY this format:

ASPECT_START
LABEL: <aspect name>
PAPER1: <analysis for paper 1>
PAPER2: <analysis for paper 2>
INSIGHT: <key similarity, difference, or synthesis — 1-2 sentences>
ASPECT_END

Compare across: Research Question, Methodology, Dataset / Evaluation, Key Results, Limitations, Overall Contribution.
Be specific; cite numbers or claims where available in the summaries."""


def compare_papers(paper1: dict, paper2: dict) -> list[dict]:
    """Return a list of comparison aspect dicts: {label, paper1, paper2, insight}."""
    def _fmt(p: dict) -> str:
        parts = [f"Title: {p.get('title', 'Untitled')}"]
        if p.get("authors"):
            parts.append(f"Authors: {', '.join((p['authors'] or [])[:3])}")
        if p.get("year"):
            parts.append(f"Year: {p['year']}")
        text = p.get("summary") or p.get("abstract") or ""
        if text:
            parts.append(f"Summary: {text[:700]}")
        return "\n".join(parts)

    user = (
        f"PAPER 1:\n{_fmt(paper1)}\n\n"
        f"PAPER 2:\n{_fmt(paper2)}\n\n"
        "Compare these papers across the key dimensions."
    )
    raw = complete(
        system=COMPARE_SYSTEM,
        messages=[{"role": "user", "content": user}],
        max_tokens=2000,
        temperature=0.3,
    )

    aspects: list[dict] = []
    for block in raw.split("ASPECT_START"):
        block = block.strip()
        if "ASPECT_END" not in block:
            continue
        block = block[: block.index("ASPECT_END")].strip()
        fields: dict[str, str] = {}
        for line in block.splitlines():
            for key in ("LABEL", "PAPER1", "PAPER2", "INSIGHT"):
                if line.startswith(f"{key}: "):
                    fields[key.lower()] = line[len(key) + 2:].strip()
        if fields.get("label"):
            aspects.append(fields)
    return aspects


def generate_chart_code(description: str) -> str:
    user = (
        f"Chart request: {description}\n\n"
        "Write the script. If the user did not provide data, invent a small "
        "illustrative dataset and label it as illustrative on the chart."
    )
    code = complete(
        system=GRAPH_SYSTEM,
        messages=[{"role": "user", "content": user}],
        max_tokens=1200,
        temperature=0.2,
    )
    # Strip stray fences if Claude ignored instructions.
    if code.startswith("```"):
        code = code[3:]
        if code.lower().startswith("python"):
            code = code[len("python"):]
        code = code.strip()
        if code.endswith("```"):
            code = code[:-3].strip()
    return code
