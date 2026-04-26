from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase
from ..services import arxiv as arxiv_svc
from ..services import doi as doi_svc
from ..services.chunking import Chunk, chunk_pages
from ..services.claude import generate_tags, summarize_paper
from ..services.embeddings import embed_texts
from ..services.pdf import parse_pdf

router = APIRouter(prefix="/ingest", tags=["ingest"])


class ArxivIn(BaseModel):
    arxiv: str


class DoiIn(BaseModel):
    doi: str


def _persist(
    user: CurrentUser,
    *,
    pdf_bytes: bytes,
    title: str,
    authors: list[str],
    year: int | None,
    abstract: str,
    source_url: str | None,
    source_type: str,
) -> dict:
    parsed = parse_pdf(pdf_bytes)
    final_title = title or parsed.title or "Untitled"
    final_authors = authors or parsed.authors

    summary = ""
    try:
        summary = summarize_paper(final_title, parsed.full_text)
    except Exception:
        # Don't block ingest on a summary failure; we still want chunks.
        summary = ""

    sb = get_supabase()
    result = (
        sb.table("papers")
        .insert(
            {
                "user_id": user.id,
                "title": final_title,
                "authors": final_authors,
                "year": year,
                "abstract": abstract or None,
                "summary": summary or None,
                "source_url": source_url,
                "source_type": source_type,
                "status": "unread",
            }
        )
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create paper record")
    paper = result.data[0]

    paper_id = paper["id"]

    # Upload the raw PDF to storage so the frontend can render it.
    storage_path = f"{user.id}/{paper_id}.pdf"
    try:
        sb.storage.from_("papers").upload(
            path=storage_path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
        sb.table("papers").update({"storage_path": storage_path}).eq("id", paper_id).execute()
    except Exception:
        # Storage upload is best-effort.
        pass

    chunks = chunk_pages(parsed)

    # If the PDF yielded no text (scanned/locked), fall back to abstract + title
    # so the paper is still reachable by the chat and search pipelines.
    if not chunks:
        fallback = "\n\n".join(filter(None, [abstract, final_title]))
        if fallback.strip():
            chunks = [Chunk(content=fallback.strip(), chunk_index=0, page=None)]

    if chunks:
        # Embed in batches of 64.
        rows = []
        for i in range(0, len(chunks), 64):
            batch = chunks[i : i + 64]
            vectors = embed_texts([c.content for c in batch])
            for c, v in zip(batch, vectors):
                rows.append(
                    {
                        "paper_id": paper_id,
                        "user_id": user.id,
                        "content": c.content,
                        "embedding": v,
                        "chunk_index": c.chunk_index,
                        "page": c.page,
                    }
                )
        # Insert chunks in batches of 200 to keep request size sane.
        for i in range(0, len(rows), 200):
            sb.table("chunks").insert(rows[i : i + 200]).execute()

    # Auto-tag (best-effort — never blocks ingest).
    try:
        auto_tags = generate_tags(final_title, abstract)
        if auto_tags:
            sb.table("tags").insert([
                {"paper_id": paper_id, "user_id": user.id, "name": t}
                for t in auto_tags
            ]).execute()
    except Exception:
        pass

    return {**paper, "summary": summary, "n_chunks": len(chunks)}


@router.post("/upload")
async def ingest_upload(
    file: UploadFile = File(...),
    user: CurrentUser = CurrentUserDep,
):
    if (file.content_type or "").lower() not in {
        "application/pdf",
        "application/octet-stream",
    } and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    return _persist(
        user,
        pdf_bytes=data,
        title="",
        authors=[],
        year=None,
        abstract="",
        source_url=None,
        source_type="upload",
    )


@router.post("/arxiv")
def ingest_arxiv(body: ArxivIn, user: CurrentUser = CurrentUserDep):
    arxiv_id = arxiv_svc.normalize_arxiv_id(body.arxiv)
    if not arxiv_id:
        raise HTTPException(status_code=400, detail="Could not parse arXiv id")

    try:
        meta = arxiv_svc.fetch_arxiv(arxiv_id)
        pdf_bytes = arxiv_svc.download_pdf(meta.pdf_url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"arXiv fetch failed: {exc}") from exc

    return _persist(
        user,
        pdf_bytes=pdf_bytes,
        title=meta.title,
        authors=meta.authors,
        year=meta.year,
        abstract=meta.abstract,
        source_url=f"https://arxiv.org/abs/{arxiv_id}",
        source_type="arxiv",
    )


@router.post("/doi")
def ingest_doi(body: DoiIn, user: CurrentUser = CurrentUserDep):
    """DOI ingest fetches metadata from Crossref and stores the abstract as
    searchable chunks. Full PDF is not available for most publisher DOIs."""
    try:
        meta = doi_svc.fetch_doi(body.doi)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"DOI fetch failed: {exc}") from exc

    sb = get_supabase()
    result = (
        sb.table("papers")
        .insert(
            {
                "user_id": user.id,
                "title": meta.title or "Untitled",
                "authors": meta.authors,
                "year": meta.year,
                "abstract": meta.abstract or None,
                "summary": None,
                "source_url": meta.url,
                "source_type": "doi",
                "status": "queued",
            }
        )
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create paper record")
    paper = result.data[0]
    paper_id = paper["id"]

    # Chunk the abstract (and title) so this paper is reachable by chat/search.
    n_chunks = 0
    text = "\n\n".join(filter(None, [meta.title, meta.abstract]))
    if text.strip():
        try:
            # Split into overlapping chunks so long abstracts are properly indexed.
            raw_chunks: list[str] = []
            target = 1400
            overlap = 200
            cleaned = " ".join(text.split())
            start = 0
            while start < len(cleaned):
                end = min(start + target, len(cleaned))
                raw_chunks.append(cleaned[start:end])
                if end >= len(cleaned):
                    break
                start = max(end - overlap, start + 1)

            vectors = embed_texts(raw_chunks)
            rows = [
                {
                    "paper_id": paper_id,
                    "user_id": user.id,
                    "content": chunk,
                    "embedding": vec,
                    "chunk_index": i,
                    "page": None,
                }
                for i, (chunk, vec) in enumerate(zip(raw_chunks, vectors))
            ]
            sb.table("chunks").insert(rows).execute()
            n_chunks = len(rows)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Embedding failed: {exc}") from exc

    # Auto-tag from title + abstract (best-effort).
    try:
        auto_tags = generate_tags(meta.title or "", meta.abstract or "")
        if auto_tags:
            sb.table("tags").insert([
                {"paper_id": paper_id, "user_id": user.id, "name": t}
                for t in auto_tags
            ]).execute()
    except Exception:
        pass

    return {**paper, "n_chunks": n_chunks}
