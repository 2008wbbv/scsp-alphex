from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import chat, forge, graph, ingest, latex, notes, papers, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_settings()  # validates all required env vars at startup
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Alphex API", version="0.1.0", lifespan=lifespan)

    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    if not origins:
        raise RuntimeError(
            "CORS_ORIGINS must be set; refusing to start with allow_credentials=True "
            "and allow_origins=['*'] (browsers reject this combination)."
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(ingest.router)
    app.include_router(search.router)
    app.include_router(chat.router)
    app.include_router(papers.router)
    app.include_router(notes.router)
    app.include_router(graph.router)
    app.include_router(latex.router)
    app.include_router(forge.router)

    @app.get("/")
    def root():
        return {"name": "alphex", "ok": True}

    @app.get("/health")
    def health():
        return {"ok": True}

    return app


app = create_app()
