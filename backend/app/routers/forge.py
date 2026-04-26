import base64
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase
from ..services.claude import generate_forge_draft, generate_chart_code
from ..routers.graph import _run_chart_code

router = APIRouter(prefix="/forge", tags=["forge"])


class DraftIn(BaseModel):
    title: str = Field(default="Untitled Draft")
    notes: str = Field(..., min_length=1)
    paper_ids: list[str] = []


class SectionUpdate(BaseModel):
    sections: list[dict]
    title: str | None = None


@router.post("/draft")
def create_draft(body: DraftIn, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()

    # Fetch paper excerpts for context if paper_ids provided.
    paper_contexts: list[str] = []
    if body.paper_ids:
        for pid in body.paper_ids[:4]:
            chunks = (
                sb.table("chunks")
                .select("content")
                .eq("paper_id", pid)
                .eq("user_id", user.id)
                .order("chunk_index")
                .limit(4)
                .execute()
                .data
                or []
            )
            for c in chunks:
                paper_contexts.append(c["content"])

    try:
        sections = generate_forge_draft(body.title, body.notes, paper_contexts)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    # Generate chart images for chart_spec sections.
    enriched: list[dict] = []
    for sec in sections:
        if sec["type"] == "chart_spec":
            desc = f"{sec['content']}: {sec.get('detail', '')}. Data: {sec.get('data_hint', '')}"
            try:
                code = generate_chart_code(desc)
                png = _run_chart_code(code)
                sec = {**sec, "type": "chart", "code": code,
                       "image_base64": base64.b64encode(png).decode("ascii")}
            except Exception:
                sec = {**sec, "type": "text", "content": f"[Chart: {sec['content']}]"}
        enriched.append(sec)

    rows = (
        sb.table("forge_drafts")
        .insert({"user_id": user.id, "title": body.title, "notes": body.notes, "sections": enriched})
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to save draft")
    return rows[0]


@router.get("/drafts")
def list_drafts(user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    drafts = (
        sb.table("forge_drafts")
        .select("id,title,created_at,updated_at,share_token")
        .eq("user_id", user.id)
        .order("updated_at", desc=True)
        .execute()
        .data
        or []
    )
    return {"drafts": drafts}


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    draft = (
        sb.table("forge_drafts")
        .select("*")
        .eq("id", draft_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.patch("/drafts/{draft_id}")
def update_draft(draft_id: str, body: SectionUpdate, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    payload: dict = {"sections": body.sections, "updated_at": datetime.now(timezone.utc).isoformat()}
    if body.title is not None:
        payload["title"] = body.title
    result = (
        sb.table("forge_drafts")
        .update(payload)
        .eq("id", draft_id)
        .eq("user_id", user.id)
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Draft not found")
    return result[0]


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    sb.table("forge_drafts").delete().eq("id", draft_id).eq("user_id", user.id).execute()
    return {"ok": True}


@router.post("/drafts/{draft_id}/share")
def share_draft(draft_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    draft = (
        sb.table("forge_drafts")
        .select("id,share_token")
        .eq("id", draft_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    token = draft.get("share_token") or secrets.token_urlsafe(24)
    sb.table("forge_drafts").update({"share_token": token}).eq("id", draft_id).execute()
    return {"share_token": token}


@router.get("/shared/{token}")
def get_shared_draft(token: str):
    sb = get_supabase()
    draft = (
        sb.table("forge_drafts")
        .select("id,title,sections,created_at")
        .eq("share_token", token)
        .maybe_single()
        .execute()
        .data
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found or link is invalid")
    return draft
