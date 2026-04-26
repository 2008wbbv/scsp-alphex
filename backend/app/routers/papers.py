import requests as _req

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase
from ..services.chunking import Chunk, chunk_pages
from ..services.claude import generate_annotations
from ..services.embeddings import embed_texts
from ..services.pdf import parse_pdf

router = APIRouter(prefix="/papers", tags=["papers"])


class PaperUpdate(BaseModel):
    status: str | None = None
    title: str | None = None


class TagIn(BaseModel):
    name: str


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
