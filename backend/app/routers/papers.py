from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase

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
            pdf_url = signed.get("signedURL") or signed.get("signed_url")
        except Exception:
            pdf_url = None
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
