from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteIn(BaseModel):
    title: str | None = None
    content: str
    linked_paper_id: str | None = None
    linked_chunk_id: str | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    linked_paper_id: str | None = None
    linked_chunk_id: str | None = None


@router.get("")
def list_notes(user: CurrentUser = CurrentUserDep, paper_id: str | None = None):
    sb = get_supabase()
    q = sb.table("notes").select("*").eq("user_id", user.id)
    if paper_id:
        q = q.eq("linked_paper_id", paper_id)
    rows = q.order("created_at", desc=True).execute().data or []
    return {"notes": rows}


@router.post("")
def create_note(body: NoteIn, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    row = (
        sb.table("notes")
        .insert(
            {
                "user_id": user.id,
                "title": body.title,
                "content": body.content,
                "linked_paper_id": body.linked_paper_id,
                "linked_chunk_id": body.linked_chunk_id,
            }
        )
        .execute()
        .data[0]
    )
    return row


@router.patch("/{note_id}")
def update_note(note_id: str, body: NoteUpdate, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    if not payload:
        return {"ok": True}
    payload["updated_at"] = "now()"
    sb.table("notes").update(payload).eq("id", note_id).eq("user_id", user.id).execute()
    return {"ok": True}


@router.delete("/{note_id}")
def delete_note(note_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    sb.table("notes").delete().eq("id", note_id).eq("user_id", user.id).execute()
    return {"ok": True}


@router.get("/{note_id}")
def get_note(note_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    row = (
        sb.table("notes")
        .select("*")
        .eq("id", note_id)
        .eq("user_id", user.id)
        .single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    return row
