import re
from dataclasses import dataclass

import httpx


def _strip_jats(text: str) -> str:
    """Remove JATS/XML tags like <jats:p>, <jats:title> etc."""
    return re.sub(r"<[^>]+>", " ", text or "").strip()


@dataclass
class DoiPaper:
    doi: str
    title: str
    authors: list[str]
    abstract: str
    year: int | None
    url: str


def fetch_doi(doi: str) -> DoiPaper:
    """Resolve a DOI via the Crossref REST API."""
    doi = doi.strip().replace("https://doi.org/", "").replace("http://doi.org/", "")
    url = f"https://api.crossref.org/works/{doi}"
    try:
        with httpx.Client(timeout=20.0, headers={"Accept": "application/json"}) as client:
            r = client.get(url)
            r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ValueError(f"DOI API error {exc.response.status_code} for {doi}") from exc
    except httpx.RequestError as exc:
        raise ValueError(f"DOI network error for {doi}: {exc}") from exc

    try:
        msg = r.json().get("message", {})
    except Exception as exc:
        raise ValueError(f"DOI API returned non-JSON response for {doi}") from exc

    title = (msg.get("title") or [""])[0]
    authors = [
        " ".join(p for p in [a.get("given"), a.get("family")] if p).strip()
        for a in msg.get("author", [])
    ]
    year = None
    parts = (msg.get("issued") or {}).get("date-parts") or []
    if parts and parts[0]:
        try:
            year = int(parts[0][0])
        except (TypeError, ValueError):
            year = None

    return DoiPaper(
        doi=doi,
        title=title.strip(),
        authors=[a for a in authors if a],
        abstract=_strip_jats(msg.get("abstract") or ""),
        year=year,
        url=msg.get("URL") or f"https://doi.org/{doi}",
    )
