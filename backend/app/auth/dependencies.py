from functools import wraps
from fastapi import HTTPException, status

from app.models.user import User, UserRole


def require_role(required_role: UserRole):
    """Decorator/Dependency: Prüft ob der Benutzer die erforderliche Rolle hat."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, current_user: User, **kwargs):
            if not current_user.has_permission(required_role):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Diese Aktion erfordert mindestens die Rolle: {required_role.value}"
                )
            return await func(*args, current_user=current_user, **kwargs)
        return wrapper
    return decorator


def check_role(user: User, required_role: UserRole) -> bool:
    """Hilfsfunktion: Prüft ob der Benutzer die erforderliche Rolle hat."""
    if not user.has_permission(required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Diese Aktion erfordert mindestens die Rolle: {required_role.value}"
        )
    return True


def check_role_or_pioneer(user: User, required_role: UserRole) -> bool:
    """Prüft ob der Benutzer die erforderliche Rolle hat ODER Pioneer ist."""
    if user.is_pioneer or user.has_permission(required_role):
        return True
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Diese Aktion erfordert mindestens die Rolle: {required_role.value} oder Pioneer-Status"
    )
