from functools import lru_cache

import httpx
from supabase import create_client, Client, ClientOptions

from .config import get_settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Service-role Supabase client for backend writes/reads."""
    settings = get_settings()
    # Force HTTP/1.1 — httpx HTTP/2 + non-blocking sockets causes EAGAIN on macOS/Python 3.13
    http1_client = httpx.Client(http2=False)
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
        options=ClientOptions(httpx_client=http1_client),
    )
