from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase
from ..services.claude import chat_with_context
from ..services.embeddings import embed_query

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatIn(BaseModel):
    message: str = Field(..., min_length=1)
    history: list[dict] = []  # prior [{role, content}, ...]
    k: int = Field(default=6, ge=1, le=20)
    paper_id: str | None = None


def _format_citations(matches: list[dict], papers_by_id: dict[str, dict]) -> tuple[list[str], list[dict]]:
    blocks: list[str] = []
    citations: list[dict] = []
    for i, m in enumerate(matches, start=1):
        tag = f"S{i}"
        paper = papers_by_id.get(m["paper_id"], {})
        title = paper.get("title") or "Untitled"
        page = m.get("page")
        snippet = m["content"][:1200]
        blocks.append(f"[{tag}] {title} (p.{page}):\n{snippet}")
        citations.append(
            {
                "tag": tag,
                "paper_id": m["paper_id"],
                "chunk_id": m["chunk_id"],
                "title": title,
                "page": page,
                "authors": paper.get("authors") or [],
                "year": paper.get("year"),
            }
        )
    return blocks, citations


@router.post("")
def chat(body: ChatIn, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    matches: list[dict] = []

    try:
        embedding = embed_query(body.message)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding service error: {exc}") from exc

    try:
        matches = sb.rpc(
            "match_chunks",
            {
                "query_embedding": embedding,
                "match_user": user.id,
                "match_count": body.k,
                "filter_paper": body.paper_id,
            },
        ).execute().data or []
    except Exception:
        matches = []

    # Fallback when vector search returns nothing.
    if not matches:
        try:
            q = (
                sb.table("chunks")
                .select("id,paper_id,content,chunk_index,page")
                .eq("user_id", user.id)
            )
            if body.paper_id:
                # Scoped to one paper — return all its chunks.
                q = q.eq("paper_id", body.paper_id).order("chunk_index").limit(body.k)
            else:
                # Library-wide — keyword fallback.
                q = q.ilike("content", f"%{body.message[:80]}%").limit(body.k)

            rows = q.execute().data or []
            matches = [
                {
                    "chunk_id": r["id"],
                    "paper_id": r["paper_id"],
                    "content": r["content"],
                    "chunk_index": r["chunk_index"],
                    "page": r.get("page"),
                    "similarity": 0.0,
                }
                for r in rows
            ]
        except Exception:
            pass

    paper_ids = list({m["paper_id"] for m in matches})
    papers = []
    if paper_ids:
        papers = (
            sb.table("papers")
            .select("id,title,authors,year,source_url")
            .in_("id", paper_ids)
            .execute()
            .data
            or []
        )
    by_id = {p["id"]: p for p in papers}

    blocks, citations = _format_citations(matches, by_id)

    # Keep only role+content fields from history.
    safe_history = [
        {"role": h["role"], "content": h["content"]}
        for h in body.history
        if h.get("role") in {"user", "assistant"} and h.get("content")
    ][-8:]

    try:
        answer = chat_with_context(body.message, blocks, safe_history)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM service error: {exc}") from exc

    # Persist messages (best effort).
    try:
        sb.table("chat_messages").insert(
            [
                {"user_id": user.id, "role": "user", "content": body.message},
                {
                    "user_id": user.id,
                    "role": "assistant",
                    "content": answer,
                    "citations": citations,
                },
            ]
        ).execute()
    except Exception:
        pass

    return {"answer": answer, "citations": citations}
