import io
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase

router = APIRouter(prefix="/latex", tags=["latex"])


class LatexIn(BaseModel):
    title: str | None = None
    body: str
    paper_ids: list[str] = []
    note_id: str | None = None  # optional convenience: pull body from a note


_LATEX_ESCAPES = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def _escape(text: str) -> str:
    out = []
    for ch in text:
        out.append(_LATEX_ESCAPES.get(ch, ch))
    return "".join(out)


def _process_body_lines(text: str) -> str:
    """Escape body text and convert simple markdown to LaTeX structural commands.

    Supported:
      ## Heading   → \\section{Heading}
      ### Heading  → \\subsection{Heading}
      **text**     → \\textbf{text}   (applied before per-char escaping)
      *text*       → \\textit{text}
      - item       → \\item (wrapped in itemize automatically per-paragraph)
    """
    # Bold and italic before per-char escaping (neither * nor ** contains escapable chars)
    text = re.sub(r"\*\*(.+?)\*\*", lambda m: f"\x00BOLD\x00{m.group(1)}\x00/BOLD\x00", text)
    text = re.sub(r"\*([^*\n]+)\*",  lambda m: f"\x00ITAL\x00{m.group(1)}\x00/ITAL\x00", text)

    lines = text.split("\n")
    out: list[str] = []
    for line in lines:
        stripped = line.rstrip()
        if stripped.startswith("### "):
            out.append(f"\\subsection{{{_escape(stripped[4:])}}}")
        elif stripped.startswith("## "):
            out.append(f"\\section{{{_escape(stripped[3:])}}}")
        elif stripped.startswith("# "):
            out.append(f"\\section{{{_escape(stripped[2:])}}}")
        else:
            escaped = _escape(stripped)
            # Restore bold/italic placeholders as LaTeX commands
            escaped = escaped.replace("\x00BOLD\x00", "\\textbf{").replace("\x00/BOLD\x00", "}")
            escaped = escaped.replace("\x00ITAL\x00", "\\textit{").replace("\x00/ITAL\x00", "}")
            out.append(escaped)
    return "\n".join(out)


def _slug(text: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "", text)
    return (s[:24] or "paper").lower()


def _bibkey(authors: list[str], year: int | None, title: str, idx: int) -> str:
    surname = "anon"
    if authors:
        first = authors[0].strip()
        # Try last token as surname.
        parts = first.split()
        if parts:
            surname = re.sub(r"[^A-Za-z]", "", parts[-1]) or "anon"
    yr = str(year) if year else "nd"
    return f"{surname.lower()}{yr}{_slug(title)[:8]}{idx}"


def _bib_entry(key: str, paper: dict) -> str:
    title = (paper.get("title") or "Untitled").replace("{", "").replace("}", "")
    authors = paper.get("authors") or []
    author_str = " and ".join(authors) if authors else "Unknown"
    year = paper.get("year") or ""
    url = paper.get("source_url") or ""
    fields = [f"  title  = {{{title}}}", f"  author = {{{author_str}}}"]
    if year:
        fields.append(f"  year   = {{{year}}}")
    if url:
        fields.append(f"  url    = {{{url}}}")
    return "@article{" + key + ",\n" + ",\n".join(fields) + "\n}\n"


@router.post("")
def export_latex(body: LatexIn, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()

    # Resolve note body if requested.
    text = body.body
    title = body.title or "Research Note"
    paper_ids = list(body.paper_ids)
    if body.note_id:
        note = (
            sb.table("notes")
            .select("*")
            .eq("id", body.note_id)
            .eq("user_id", user.id)
            .maybe_single()
            .execute()
            .data
        )
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        text = note["content"]
        title = note.get("title") or title
        if note.get("linked_paper_id") and note["linked_paper_id"] not in paper_ids:
            paper_ids.append(note["linked_paper_id"])

    papers = []
    if paper_ids:
        papers = (
            sb.table("papers")
            .select("id,title,authors,year,source_url")
            .in_("id", paper_ids)
            .eq("user_id", user.id)
            .execute()
            .data
            or []
        )

    # Build bib keys in the order the papers appear in paper_ids.
    by_id = {p["id"]: p for p in papers}
    keys: dict[str, str] = {}
    bib_entries: list[str] = []
    for i, pid in enumerate(paper_ids, start=1):
        p = by_id.get(pid)
        if not p:
            continue
        key = _bibkey(p.get("authors") or [], p.get("year"), p.get("title") or "", i)
        # Deduplicate keys
        candidate = key
        n = 1
        while candidate in keys.values():
            candidate = f"{key}{n}"
            n += 1
        keys[pid] = candidate
        bib_entries.append(_bib_entry(candidate, p))

    # Replace inline citation tags. Two formats supported:
    #   [S<n>] — sequential RAG citations matching paper_ids order
    #   [paper:<uuid>] — explicit paper reference
    def replace_s_tag(match: re.Match) -> str:
        idx = int(match.group(1))
        if 1 <= idx <= len(paper_ids):
            pid = paper_ids[idx - 1]
            key = keys.get(pid)
            if key:
                return f"\\cite{{{key}}}"
        return match.group(0)

    def replace_paper_tag(match: re.Match) -> str:
        pid = match.group(1)
        key = keys.get(pid)
        return f"\\cite{{{key}}}" if key else match.group(0)

    cited_text = re.sub(r"\[S(\d+)\]", replace_s_tag, text)
    cited_text = re.sub(r"\[paper:([0-9a-fA-F-]{36})\]", replace_paper_tag, cited_text)

    # Convert markdown → LaTeX structure, escape plain text, restore \cite{}.
    escaped_body = _process_body_lines(cited_text)
    escaped_body = re.sub(
        r"\\textbackslash\{\}cite\\\{([^}]+)\\\}",
        lambda m: f"\\cite{{{m.group(1)}}}",
        escaped_body,
    )

    bib_filename = "references.bib"
    has_bib = bool(bib_entries)
    tex = (
        "% Generated by Alphex — compile with:\n"
        "%   pdflatex {f} && bibtex {f} && pdflatex {f} && pdflatex {f}\n"
        "% (save references.bib in the same directory)\n\n"
        "\\documentclass[11pt,a4paper]{article}\n"
        "\\usepackage[utf8]{inputenc}\n"
        "\\usepackage[T1]{fontenc}\n"
        "\\usepackage{lmodern}\n"
        "\\usepackage[margin=2.5cm]{geometry}\n"
        "\\usepackage{microtype}\n"
        "\\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue]{hyperref}\n"
        + ("\\usepackage{natbib}\n" if has_bib else "")
        + f"\\title{{{_escape(title)}}}\n"
        f"\\author{{{_escape(user.email or 'Alphex User')}}}\n"
        "\\date{\\today}\n"
        "\\begin{document}\n"
        "\\maketitle\n\n"
        f"{escaped_body}\n\n"
        + (
            "\\bibliographystyle{plainnat}\n"
            f"\\bibliography{{{bib_filename.replace('.bib', '')}}}\n"
            if has_bib else ""
        )
        + "\\end{document}\n"
    ).replace(
        "% Generated by Alphex — compile with:\n%   pdflatex {f}",
        f"% Generated by Alphex — compile with:\n%   pdflatex {_slug(title)}",
    )

    bib_text = "".join(bib_entries)

    return {
        "tex": tex,
        "bib": bib_text,
        "filename": f"{_slug(title)}.tex",
    }


@router.post("/download")
def download_latex(body: LatexIn, user: CurrentUser = CurrentUserDep):
    """Same as POST /latex but returns the .tex as a downloadable stream."""
    payload = export_latex(body, user)  # type: ignore[arg-type]
    buf = io.BytesIO(payload["tex"].encode("utf-8"))
    return StreamingResponse(
        buf,
        media_type="application/x-tex",
        headers={"Content-Disposition": f'attachment; filename="{payload["filename"]}"'},
    )
