import base64
import os
import re
import subprocess
import sys
import tempfile
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..auth import CurrentUser, CurrentUserDep
from ..db import get_supabase
from ..services.claude import generate_chart_code, analyze_paper_for_charts

router = APIRouter(prefix="/graph", tags=["graph"])


# Block obvious abuse before exec. This is a sandbox-by-convention layer; a
# real deploy should also run the script in a locked-down container.
_FORBIDDEN = re.compile(
    r"\b(import\s+(os|subprocess|socket|shutil|requests|urllib|httpx|ftplib|"
    r"telnetlib|smtplib|pty|fcntl|ctypes|multiprocessing|threading|http|"
    r"importlib|pickle)|__import__|eval\s*\(|exec\s*\(|open\s*\(|"
    r"compile\s*\()",
    re.IGNORECASE,
)
_ALLOWED_OS = re.compile(r"^\s*import\s+os\s*(#.*)?$", re.MULTILINE)


class GraphIn(BaseModel):
    description: str = Field(..., min_length=1)


@router.post("")
def make_graph(body: GraphIn, user: CurrentUser = CurrentUserDep):
    code = generate_chart_code(body.description)

    # Allow `import os` (we need it to read OUT) but block everything else.
    scrubbed = _ALLOWED_OS.sub("", code)
    if _FORBIDDEN.search(scrubbed):
        raise HTTPException(
            status_code=400,
            detail="Generated code uses disallowed modules; please rephrase.",
        )

    out_path = os.path.join(tempfile.gettempdir(), f"alphex_{uuid.uuid4().hex}.png")
    script_path = out_path + ".py"

    preamble = (
        "import matplotlib\n"
        "matplotlib.use('Agg')\n"
        "import os\n"
    )
    try:
        with open(script_path, "w") as f:
            f.write(preamble + code)
        env = {
            "PATH": os.environ.get("PATH", ""),
            "OUT": out_path,
            "MPLBACKEND": "Agg",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            timeout=20,
            env=env,
            cwd=tempfile.gettempdir(),
        )
        if proc.returncode != 0 or not os.path.exists(out_path):
            raise HTTPException(
                status_code=500,
                detail=f"Chart execution failed: {proc.stderr.decode(errors='replace')[:500]}",
            )
        with open(out_path, "rb") as f:
            png = f.read()
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Chart generation timed out")
    finally:
        for p in (script_path, out_path):
            try:
                os.remove(p)
            except OSError:
                pass

    return {
        "image_base64": base64.b64encode(png).decode("ascii"),
        "code": code,
    }


def _run_chart_code(code: str) -> bytes:
    """Execute chart code and return PNG bytes. Raises HTTPException on failure."""
    scrubbed = _ALLOWED_OS.sub("", code)
    if _FORBIDDEN.search(scrubbed):
        raise HTTPException(status_code=400, detail="Generated code uses disallowed modules")

    out_path = os.path.join(tempfile.gettempdir(), f"alphex_{uuid.uuid4().hex}.png")
    script_path = out_path + ".py"
    preamble = (
        "import matplotlib\nmatplotlib.use('Agg')\n"
        "import matplotlib.pyplot as plt\nimport numpy as np\nimport os\n"
    )
    try:
        with open(script_path, "w") as f:
            f.write(preamble + code)
        env = {
            "PATH": os.environ.get("PATH", ""),
            "OUT": out_path,
            "MPLBACKEND": "Agg",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True, timeout=20, env=env, cwd=tempfile.gettempdir(),
        )
        if proc.returncode != 0 or not os.path.exists(out_path):
            raise HTTPException(
                status_code=500,
                detail=f"Chart execution failed: {proc.stderr.decode(errors='replace')[:300]}",
            )
        with open(out_path, "rb") as f:
            return f.read()
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Chart timed out")
    finally:
        for p in (script_path, out_path):
            try:
                os.remove(p)
            except OSError:
                pass


@router.post("/paper/{paper_id}")
def charts_from_paper(paper_id: str, user: CurrentUser = CurrentUserDep):
    sb = get_supabase()
    paper = (
        sb.table("papers")
        .select("id,title,user_id")
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
        .select("content")
        .eq("paper_id", paper_id)
        .order("chunk_index")
        .execute()
        .data
        or []
    )
    if not chunks:
        raise HTTPException(status_code=422, detail="No text found for this paper. DOI papers only store the abstract — delete and re-import this paper to pick up the fix.")

    texts = [c["content"] for c in chunks]
    try:
        chart_specs = analyze_paper_for_charts(paper["title"], texts)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    results = []
    for spec in chart_specs:
        try:
            png = _run_chart_code(spec["code"])
            results.append({
                "title": spec["title"],
                "explanation": spec["explanation"],
                "image_base64": base64.b64encode(png).decode("ascii"),
                "code": spec["code"],
            })
        except HTTPException:
            continue

    if not results:
        raise HTTPException(status_code=500, detail="Could not generate any charts from this paper.")

    return {"charts": results}
