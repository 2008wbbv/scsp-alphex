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
    doc = fitz.open(stream=data, filetype="pdf")

    pages: list[ParsedPage] = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        if text.strip():
            pages.append(ParsedPage(page=i + 1, text=text))

    meta = doc.metadata or {}
    title = (meta.get("title") or "").strip() or None
    authors_raw = (meta.get("author") or "").strip()
    authors = [a.strip() for a in authors_raw.replace(";", ",").split(",") if a.strip()]

    # Heuristic: if no PDF metadata title, take the first non-empty line
    # of the first page that looks "title-ish".
    if not title and pages:
        for line in pages[0].text.splitlines():
            line = line.strip()
            if 8 <= len(line) <= 200 and not line.lower().startswith(("abstract", "introduction")):
                title = line
                break

    doc.close()
    return ParsedPDF(title=title, authors=authors, pages=pages)
