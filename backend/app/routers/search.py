from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase
from ..services.embeddings import embed_query

router = APIRouter(prefix="/search", tags=["search"])


class SearchIn(BaseModel):
    query: str = Field(..., min_length=1)
    k: int = Field(default=8, ge=1, le=50)
    paper_id: str | None = None


@router.post("")
def search(body: SearchIn, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    try:
        embedding = embed_query(body.query)
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
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vector search error: {exc}") from exc

    if not matches:
        return {"results": []}

    paper_ids = list({m["paper_id"] for m in matches})
    papers = (
        sb.table("papers")
        .select("id,title,authors,year,source_url")
        .in_("id", paper_ids)
        .execute()
        .data
        or []
    )
    by_id = {p["id"]: p for p in papers}

    results = []
    for m in matches:
        paper = by_id.get(m["paper_id"], {})
        results.append(
            {
                "chunk_id": m["chunk_id"],
                "paper_id": m["paper_id"],
                "content": m["content"],
                "page": m.get("page"),
                "chunk_index": m.get("chunk_index"),
                "similarity": m.get("similarity"),
                "paper": {
                    "id": paper.get("id"),
                    "title": paper.get("title"),
                    "authors": paper.get("authors") or [],
                    "year": paper.get("year"),
                    "source_url": paper.get("source_url"),
                },
            }
        )
    return {"results": results}
