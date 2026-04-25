import jwt
from fastapi import Depends, Header, HTTPException, status
from .config import get_settings


class CurrentUser:
    def __init__(self, user_id: str, email: str | None = None):
        self.id = user_id
        self.email = email


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    """Verify a Supabase-issued JWT and return the calling user."""
    settings = get_settings()

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing subject")

    return CurrentUser(user_id=user_id, email=payload.get("email"))


CurrentUserDep = Depends(get_current_user)
