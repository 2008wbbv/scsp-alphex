import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass

import httpx


@dataclass
class ArxivPaper:
    arxiv_id: str
    title: str
    authors: list[str]
    abstract: str
    year: int | None
    pdf_url: str


_ARXIV_ID = re.compile(r"(\d{4}\.\d{4,5})(v\d+)?")
_NS = {"a": "http://www.w3.org/2005/Atom"}


def normalize_arxiv_id(value: str) -> str | None:
    """Accept arxiv URLs or bare ids; return the canonical id (no version)."""
    if not value or not isinstance(value, str):
        return None
    m = _ARXIV_ID.search(value.strip())
    return m.group(1) if m else None


def fetch_arxiv(arxiv_id: str) -> ArxivPaper:
    url = f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.get(url)
            r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ValueError(f"arXiv API error {exc.response.status_code} for {arxiv_id}") from exc
    except httpx.RequestError as exc:
        raise ValueError(f"arXiv network error for {arxiv_id}: {exc}") from exc

    try:
        root = ET.fromstring(r.text)
    except ET.ParseError as exc:
        raise ValueError(f"arXiv returned malformed XML for {arxiv_id}") from exc

    entry = root.find("a:entry", _NS)
    if entry is None:
        raise ValueError(f"arXiv returned no entry for {arxiv_id}")

    title = (entry.findtext("a:title", default="", namespaces=_NS) or "").strip()
    abstract = (entry.findtext("a:summary", default="", namespaces=_NS) or "").strip()
    authors = [
        (a.findtext("a:name", default="", namespaces=_NS) or "").strip()
        for a in entry.findall("a:author", _NS)
    ]
    published = entry.findtext("a:published", default="", namespaces=_NS) or ""
    year = int(published[:4]) if published[:4].isdigit() else None

    return ArxivPaper(
        arxiv_id=arxiv_id,
        title=" ".join(title.split()),
        authors=[a for a in authors if a],
        abstract=" ".join(abstract.split()),
        year=year,
        pdf_url=f"https://arxiv.org/pdf/{arxiv_id}.pdf",
    )


def download_pdf(url: str) -> bytes:
    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            if not r.content:
                raise ValueError(f"Empty PDF response from {url}")
            return r.content
    except httpx.HTTPStatusError as exc:
        raise ValueError(f"PDF download failed with status {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        raise ValueError(f"PDF download network error: {exc}") from exc
