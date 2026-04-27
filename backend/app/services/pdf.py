from dataclasses import dataclass
import fitz  # PyMuPDF


@dataclass
class ParsedPage:
    page: int
    text: str


@dataclass
class ParsedPDF:
    title: str | None
    authors: list[str]
    pages: list[ParsedPage]

    @property
    def full_text(self) -> str:
        return "\n\n".join(p.text for p in self.pages)


def parse_pdf(data: bytes) -> ParsedPDF:
    """Parse a PDF byte string into pages + best-effort metadata."""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Failed to open PDF: {exc}") from exc

    try:
        pages: list[ParsedPage] = []
        for i, page in enumerate(doc):
            text = page.get_text("text")
            if text.strip():
                pages.append(ParsedPage(page=i + 1, text=text))

        meta = doc.metadata or {}
        title = (meta.get("title") or "").strip() or None
        authors_raw = (meta.get("author") or "").strip()
        authors = [a.strip() for a in authors_raw.replace(";", ",").split(",") if a.strip()]

        if not title and pages:
            import re as _re
            _skip = _re.compile(
                r"^(doi[:\s]|https?://|10\.\d{4,}/|\d+\s*[\|/]\s*|"
                r"vol\.?\s*\d|nature\b|science\b|cell\b|arxiv\b|preprint\b|"
                r"received\b|accepted\b|published\b|copyright\b|©|\d{4}\s+\w+\s+\d+)",
                _re.IGNORECASE,
            )
            for line in pages[0].text.splitlines():
                line = line.strip()
                if 12 <= len(line) <= 200 and not _skip.search(line) and not line.lower().startswith(
                    ("abstract", "introduction", "keywords", "figure", "table", "supplementary")
                ):
                    title = line
                    break
    finally:
        doc.close()

    return ParsedPDF(title=title, authors=authors, pages=pages)
