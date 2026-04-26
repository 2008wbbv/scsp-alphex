from dataclasses import dataclass
import re

from .pdf import ParsedPDF


@dataclass
class Chunk:
    content: str
    chunk_index: int
    page: int


_WHITESPACE = re.compile(r"\s+")


def _clean(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip()


def chunk_pages(parsed: ParsedPDF, target_chars: int = 1400, overlap: int = 200) -> list[Chunk]:
    """Sliding-window chunker that preserves the page number of the first
    character of each chunk. Operates per-page first so chunks don't span
    page breaks unless absolutely necessary."""
    chunks: list[Chunk] = []
    idx = 0

    for page in parsed.pages:
        text = _clean(page.text)
        if not text:
            continue

        if len(text) <= target_chars:
            chunks.append(Chunk(content=text, chunk_index=idx, page=page.page))
            idx += 1
            continue

        start = 0
        while start < len(text):
            end = min(start + target_chars, len(text))
            # Try to break at a sentence boundary if one exists nearby.
            if end < len(text):
                window_start = max(0, end - 100)
                window = text[window_start : end + 100]
                period = window.rfind(". ")
                if period != -1:
                    end = window_start + period + 1
            content = text[start:end].strip()
            if content:
                chunks.append(Chunk(content=content, chunk_index=idx, page=page.page))
                idx += 1
            if end >= len(text):
                break
            start = max(end - overlap, start + 1)

    return chunks
