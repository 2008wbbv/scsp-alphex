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
    "paper library. Answer using ONLY the provided context snippets. Each "
    "snippet is tagged like [S1], [S2]. When you state a fact, append the "
    "matching tag(s) inline, e.g. 'Transformers outperform RNNs on long "
    "sequences [S2].' If the context is insufficient, say so plainly. Never "
    "fabricate citations or numbers."
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

Given paper chunks, identify 2-3 distinct quantitative findings, comparisons, or trends and write a matplotlib script for each.

Return EXACTLY this format (no markdown, no extra text):

CHART_START
TITLE: <short chart title>
EXPLANATION: <1-2 sentences: what this shows and the key insight>
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


def analyze_paper_for_charts(title: str, chunks: list[str]) -> list[dict]:
    """Return a list of {title, explanation, code} dicts from paper content."""
    context = "\n\n---\n\n".join(chunks[:20])  # cap to avoid token overflow
    user = (
        f"Paper: {title}\n\n"
        f"Excerpts:\n{context}\n\n"
        "Generate 2-3 charts based on quantitative data or comparisons in this paper."
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
            code_start = block.index("CODE:") + len("CODE:")
            code = block[code_start:].strip()
            charts.append({
                "title": title_line.replace("TITLE:", "").strip(),
                "explanation": exp_line.replace("EXPLANATION:", "").strip(),
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
