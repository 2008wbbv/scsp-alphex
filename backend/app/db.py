from functools import lru_cache

from supabase import create_client, Client

from .config import get_settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Service-role Supabase client for backend writes/reads.

    The backend trusts the JWT it has already verified and scopes every
    query by user_id, so it uses the service role key. RLS still protects
    direct PostgREST access from the frontend.
    """
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
