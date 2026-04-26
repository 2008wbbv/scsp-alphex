from fastapi import Depends, Header, HTTPException, status
from .db import get_supabase


class CurrentUser:
    def __init__(self, user_id: str, email: str | None = None):
        self.id = user_id
        self.email = email


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    """Verify a Supabase-issued JWT via the Supabase client and return the calling user."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    token = authorization.split(" ", 1)[1].strip()
    try:
        response = get_supabase().auth.get_user(token)
        user = response.user
        if not user:
            raise ValueError("No user returned")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return CurrentUser(user_id=user.id, email=user.email)


CurrentUserDep = Depends(get_current_user)
