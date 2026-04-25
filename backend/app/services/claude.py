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
        code = code.strip("`")
        if code.lower().startswith("python"):
            code = code[len("python"):]
        code = code.strip()
        if code.endswith("```"):
            code = code[:-3].strip()
    return code
