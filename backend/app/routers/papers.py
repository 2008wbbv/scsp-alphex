import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import requests as _req

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase
from ..services.chunking import Chunk, chunk_pages
from ..services.claude import compare_papers, generate_annotations, generate_literature_review, generate_research_questions
from ..services.embeddings import embed_texts
from ..services.pdf import parse_pdf

router = APIRouter(prefix="/papers", tags=["papers"])


class PaperUpdate(BaseModel):
    status: str | None = None
    title: str | None = None


class TagIn(BaseModel):
    name: str


class ResearchQuestionsIn(BaseModel):
    paper_ids: list[str]
    topics: str = ""


class CompareIn(BaseModel):
    paper_id_1: str
    paper_id_2: str


class LitReviewIn(BaseModel):
    paper_ids: list[str]
    focus: str = ""


@router.get("")
def list_papers(user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    papers = (
        sb.table("papers")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    if not papers:
        return {"papers": []}

    paper_ids = [p["id"] for p in papers]
    tags = (
        sb.table("tags")
        .select("paper_id,name")
        .in_("paper_id", paper_ids)
        .execute()
        .data
        or []
    )
    tags_by_paper: dict[str, list[str]] = {}
    for t in tags:
        tags_by_paper.setdefault(t["paper_id"], []).append(t["name"])

    for p in papers:
        p["tags"] = tags_by_paper.get(p["id"], [])

    return {"papers": papers}


@router.get("/graph")
def paper_graph(user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    papers = (
        sb.table("papers")
        .select("id,title,authors,year,status")
        .eq("user_id", user.id)
        .execute()
        .data
        or []
    )
    nodes = [
        {
            "id": p["id"],
            "title": p["title"],
            "authors": p.get("authors") or [],
            "year": p.get("year"),
            "status": p.get("status", "unread"),
        }
        for p in papers
    ]
    edges: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for p in papers:
        rows = sb.rpc(
            "related_papers",
            {"source_paper": p["id"], "match_user": user.id, "match_count": 5},
        ).execute().data or []
        for r in rows:
            if r["similarity"] < 0.6:
                continue
            key = (min(p["id"], r["paper_id"]), max(p["id"], r["paper_id"]))
            if key in seen:
                continue
            seen.add(key)
            edges.append(
                {
                    "source": p["id"],
                    "target": r["paper_id"],
                    "similarity": round(r["similarity"], 3),
                }
            )
    return {"nodes": nodes, "edges": edges}


@router.get("/arxiv-search")
def arxiv_search(q: str, limit: int = 10):
    """Search arXiv public API — no auth required."""
    encoded = urllib.parse.quote(q.strip())
    url = (
        f"http://export.arxiv.org/api/query"
        f"?search_query=all:{encoded}"
        f"&max_results={min(limit, 20)}"
        f"&sortBy=relevance"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = resp.read()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"arXiv API error: {exc}")

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(data)
    results = []
    for entry in root.findall("atom:entry", ns):
        raw_id = (entry.findtext("atom:id", "", ns) or "").strip()
        arxiv_id = raw_id.split("/abs/")[-1].rsplit("v", 1)[0] if "/abs/" in raw_id else ""
        title = " ".join((entry.findtext("atom:title", "", ns) or "").split())
        summary = " ".join((entry.findtext("atom:summary", "", ns) or "").split())
        published = entry.findtext("atom:published", "", ns) or ""
        year = int(published[:4]) if len(published) >= 4 and published[:4].isdigit() else None
        authors = [
            (a.findtext("atom:name", "", ns) or "").strip()
            for a in entry.findall("atom:author", ns)
        ]
        results.append({"arxiv_id": arxiv_id, "title": title, "abstract": summary[:500], "authors": authors, "year": year})
    return {"results": results}


@router.post("/literature-review")
def literature_review(body: LitReviewIn, user: CurrentUser = CurrentUserDep):
    if not body.paper_ids:
        raise HTTPException(status_code=422, detail="Select at least one paper")
    sb = get_supabase()
    papers = (
        sb.table("papers")
        .select("id,title,authors,year,summary,abstract")
        .in_("id", body.paper_ids[:20])
        .eq("user_id", user.id)
        .execute()
        .data
        or []
    )
    if not papers:
        raise HTTPException(status_code=422, detail="No valid papers found")
    by_id = {p["id"]: p for p in papers}
    ordered = [by_id[pid] for pid in body.paper_ids if pid in by_id]
    try:
        text = generate_literature_review(ordered, body.focus)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}")
    return {
        "text": text,
        "papers": [
            {"id": p["id"], "title": p["title"], "year": p.get("year"), "authors": p.get("authors")}
            for p in ordered
        ],
    }


@router.post("/research-questions")
def research_questions(body: ResearchQuestionsIn, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    papers = (
        sb.table("papers")
        .select("id,title,summary,abstract")
        .in_("id", body.paper_ids)
        .eq("user_id", user.id)
        .execute()
        .data
        or []
    )
    if not papers:
        raise HTTPException(status_code=422, detail="No valid papers found.")
    try:
        result = generate_research_questions(papers, body.topics)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}")
    return result


@router.post("/compare")
def compare(body: CompareIn, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    papers = (
        sb.table("papers")
        .select("id,title,authors,year,summary,abstract")
        .in_("id", [body.paper_id_1, body.paper_id_2])
        .eq("user_id", user.id)
        .execute()
        .data
        or []
    )
    by_id = {p["id"]: p for p in papers}
    p1 = by_id.get(body.paper_id_1)
    p2 = by_id.get(body.paper_id_2)
    if not p1 or not p2:
        raise HTTPException(status_code=404, detail="One or both papers not found.")
    try:
        aspects = compare_papers(p1, p2)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}")
    return {
        "aspects": aspects,
        "paper1": {"id": p1["id"], "title": p1["title"]},
        "paper2": {"id": p2["id"], "title": p2["title"]},
    }


@router.get("/{paper_id}/references")
def get_references(paper_id: str, user: CurrentUser = CurrentUserDep):
    """Fetch the reference list for a paper via Semantic Scholar."""
    sb = get_supabase()
    paper = (
        sb.table("papers")
        .select("id,title,source_type,source_url")
        .eq("id", paper_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    ss_id = None
    if paper.get("source_type") == "arxiv" and paper.get("source_url"):
        raw_arxiv = paper["source_url"].split("/abs/")[-1].rsplit("v", 1)[0]
        if raw_arxiv:
            ss_id = f"arXiv:{raw_arxiv}"

    if not ss_id:
        raise HTTPException(
            status_code=422,
            detail="References are available for arXiv papers only.",
        )

    url = (
        f"https://api.semanticscholar.org/graph/v1/paper/{ss_id}/references"
        "?fields=title,authors,year,externalIds,url&limit=50"
    )
    try:
        r = _req.get(url, headers={"User-Agent": "Alphex/1.0"}, timeout=12)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Semantic Scholar error: {exc}")

    refs = []
    for item in data.get("data", []):
        cited = item.get("citedPaper") or {}
        if not cited.get("title"):
            continue
        eids = cited.get("externalIds") or {}
        arxiv_id = eids.get("ArXiv")
        doi = eids.get("DOI")
        url_field = cited.get("url") or (
            f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else None
        )
        refs.append(
            {
                "title": cited.get("title", ""),
                "authors": [
                    a.get("name", "") for a in (cited.get("authors") or [])[:5]
                ],
                "year": cited.get("year"),
                "arxiv_id": arxiv_id,
                "doi": doi,
                "url": url_field,
            }
        )
    return {"references": refs}


@router.get("/{paper_id}")
def get_paper(paper_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    paper = (
        sb.table("papers")
        .select("*")
        .eq("id", paper_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    tags = (
        sb.table("tags")
        .select("name")
        .eq("paper_id", paper_id)
        .execute()
        .data
        or []
    )
    paper["tags"] = [t["name"] for t in tags]

    storage_path = paper.get("storage_path")
    pdf_url = None
    if storage_path:
        try:
            signed = sb.storage.from_("papers").create_signed_url(storage_path, 60 * 60)
            pdf_url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
        except Exception:
            pdf_url = None
    # Fallback: derive PDF URL from arXiv source URL
    if not pdf_url and paper.get("source_type") == "arxiv" and paper.get("source_url"):
        src = paper["source_url"]
        if "/abs/" in src:
            pdf_url = src.replace("/abs/", "/pdf/")
    paper["pdf_url"] = pdf_url

    return paper


@router.patch("/{paper_id}")
def update_paper(paper_id: str, body: PaperUpdate, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    if not payload:
        return {"ok": True}
    if "status" in payload and payload["status"] not in {"unread", "reading", "read", "queued"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    sb.table("papers").update(payload).eq("id", paper_id).eq("user_id", user.id).execute()
    return {"ok": True}


@router.delete("/{paper_id}")
def delete_paper(paper_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    sb.table("papers").delete().eq("id", paper_id).eq("user_id", user.id).execute()
    return {"ok": True}


def _build_chunks(sb, paper_id: str, user_id: str, paper: dict) -> list[dict]:
    """Download + parse + embed a paper. Returns the stored chunk rows.
    Raises HTTPException if no text can be extracted or embedding fails."""
    pdf_bytes: bytes | None = None

    if paper.get("storage_path"):
        try:
            signed = sb.storage.from_("papers").create_signed_url(paper["storage_path"], 300)
            url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
            if url:
                r = _req.get(url, timeout=30)
                r.raise_for_status()
                pdf_bytes = r.content
        except Exception:
            pdf_bytes = None

    if not pdf_bytes and paper.get("source_type") == "arxiv" and paper.get("source_url"):
        src = paper["source_url"]
        pdf_url = src.replace("/abs/", "/pdf/") if "/abs/" in src else src
        try:
            r = _req.get(pdf_url, timeout=30, headers={"User-Agent": "Alphex/1.0"})
            r.raise_for_status()
            pdf_bytes = r.content
        except Exception:
            pdf_bytes = None

    chunks: list[Chunk] = []
    if pdf_bytes:
        try:
            parsed = parse_pdf(pdf_bytes)
            chunks = chunk_pages(parsed)
        except Exception:
            chunks = []

    if not chunks:
        fallback = "\n\n".join(filter(None, [paper.get("abstract"), paper.get("title")]))
        if fallback.strip():
            chunks = [Chunk(content=fallback.strip(), chunk_index=0, page=None)]

    if not chunks:
        raise HTTPException(status_code=422, detail="No text could be extracted from this paper.")

    sb.table("chunks").delete().eq("paper_id", paper_id).eq("user_id", user_id).execute()

    rows: list[dict] = []
    for i in range(0, len(chunks), 64):
        batch = chunks[i : i + 64]
        try:
            vectors = embed_texts([c.content for c in batch])
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Embedding failed: {exc}") from exc
        for c, v in zip(batch, vectors):
            rows.append({
                "paper_id": paper_id,
                "user_id": user_id,
                "content": c.content,
                "embedding": v,
                "chunk_index": c.chunk_index,
                "page": c.page,
            })

    for i in range(0, len(rows), 200):
        sb.table("chunks").insert(rows[i : i + 200]).execute()

    return rows


@router.post("/{paper_id}/rechunk")
def rechunk_paper(paper_id: str, user: CurrentUser = CurrentUserDep):
    """Re-download and re-embed a paper's text. Replaces any existing chunks."""
    sb = get_supabase()
    paper = (
        sb.table("papers")
        .select("id,title,abstract,source_type,source_url,storage_path")
        .eq("id", paper_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    rows = _build_chunks(sb, paper_id, user.id, paper)
    return {"ok": True, "n_chunks": len(rows)}


@router.post("/{paper_id}/tags")
def add_tag(paper_id: str, body: TagIn, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name required")

    # Verify the paper belongs to this user before tagging.
    paper = (
        sb.table("papers")
        .select("id")
        .eq("id", paper_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    try:
        sb.table("tags").insert(
            {"paper_id": paper_id, "user_id": user.id, "name": name}
        ).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" not in msg and "duplicate" not in msg:
            raise HTTPException(status_code=500, detail="Failed to add tag") from exc
    return {"ok": True}


@router.delete("/{paper_id}/tags/{name}")
def remove_tag(paper_id: str, name: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    sb.table("tags").delete().eq("paper_id", paper_id).eq("user_id", user.id).eq(
        "name", name
    ).execute()
    return {"ok": True}


@router.get("/{paper_id}/annotate")
def get_annotations(paper_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    paper = (
        sb.table("papers")
        .select("id,title,abstract,source_type,source_url,storage_path")
        .eq("id", paper_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    chunks = (
        sb.table("chunks")
        .select("content,page,chunk_index")
        .eq("paper_id", paper_id)
        .order("chunk_index")
        .limit(20)
        .execute()
        .data
        or []
    )

    # Auto-index on first visit if no chunks exist yet.
    if not chunks:
        _build_chunks(sb, paper_id, user.id, paper)
        chunks = (
            sb.table("chunks")
            .select("content,page,chunk_index")
            .eq("paper_id", paper_id)
            .order("chunk_index")
            .limit(20)
            .execute()
            .data
            or []
        )

    if not chunks:
        raise HTTPException(status_code=422, detail="No text could be extracted from this paper.")

    try:
        terms = generate_annotations(paper["title"], [c["content"] for c in chunks])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    return {"chunks": chunks, "terms": terms}


@router.get("/{paper_id}/related")
def related(paper_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    rows = sb.rpc(
        "related_papers",
        {"source_paper": paper_id, "match_user": user.id, "match_count": 5},
    ).execute().data or []
    if not rows:
        return {"related": []}
    paper_ids = [r["paper_id"] for r in rows]
    papers = (
        sb.table("papers")
        .select("id,title,authors,year")
        .in_("id", paper_ids)
        .execute()
        .data
        or []
    )
    by_id = {p["id"]: p for p in papers}
    enriched = []
    for r in rows:
        p = by_id.get(r["paper_id"])
        if not p:
            continue
        enriched.append({**p, "similarity": r["similarity"]})
    return {"related": enriched}
