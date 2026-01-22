import secrets
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.models.user import User, UserRole, GuestToken
from app.schemas.user import UserResponse, GuestTokenCreate, GuestTokenResponse, GuestLoginResponse
from app.auth.discord import get_oauth_url, exchange_code, get_discord_user, get_user_guilds, is_member_of_guild
from app.auth.jwt import create_access_token, get_current_user
from app.auth.dependencies import check_role

router = APIRouter()
settings = get_settings()

# Einfacher State-Speicher (in Produktion: Redis oder DB)
oauth_states: dict[str, bool] = {}


@router.get("/login")
async def login():
    """Startet den Discord OAuth-Flow."""
    state = secrets.token_urlsafe(32)
    oauth_states[state] = True
    oauth_url = get_oauth_url(state)
    return {"url": oauth_url}


@router.get("/callback")
async def callback(code: str, state: str, db: Session = Depends(get_db)):
    """Discord OAuth Callback - tauscht Code gegen Token."""
    # State validieren
    if state not in oauth_states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ungültiger OAuth State"
        )
    del oauth_states[state]

    # Code gegen Discord Access Token tauschen
    discord_token = await exchange_code(code)
    if not discord_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fehler beim Token-Austausch mit Discord"
        )

    # Discord User-Daten abrufen
    discord_user = await get_discord_user(discord_token)
    if not discord_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fehler beim Abrufen der Discord-Benutzerdaten"
        )

    # Guild-Prüfung wenn konfiguriert
    if settings.required_guild_id:
        guilds = await get_user_guilds(discord_token)
        if not is_member_of_guild(guilds, settings.required_guild_id):
            error_url = f"{settings.frontend_url}/auth/error?reason=not_member"
            return RedirectResponse(url=error_url)

    # Benutzer in DB suchen oder anlegen
    user = db.query(User).filter(User.discord_id == discord_user.id).first()
    is_new_user = user is None

    if is_new_user:
        # Prüfen ob dies der Admin ist
        is_admin = (
            settings.admin_discord_id
            and discord_user.id == settings.admin_discord_id
        )
        user = User(
            discord_id=discord_user.id,
            username=discord_user.username,
            display_name=discord_user.global_name,
            avatar=discord_user.avatar_url,
            role=UserRole.ADMIN if is_admin else UserRole.GUEST,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Benutzer-Daten aktualisieren
        user.username = discord_user.username
        user.display_name = discord_user.global_name or user.display_name
        user.avatar = discord_user.avatar_url

        # Falls Admin-ID gesetzt und User noch kein Admin, upgraden
        if (
            settings.admin_discord_id
            and discord_user.id == settings.admin_discord_id
            and user.role != UserRole.ADMIN
        ):
            user.role = UserRole.ADMIN

        db.commit()

    # JWT Token erstellen (sub muss String sein)
    access_token = create_access_token(data={"sub": str(user.id)})

    # Redirect zum Frontend mit Token
    frontend_url = f"{settings.frontend_url}/auth/success?token={access_token}"
    return RedirectResponse(url=frontend_url)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Gibt den aktuell eingeloggten Benutzer zurück."""
    return current_user


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """Logout - clientseitig wird der Token gelöscht."""
    return {"message": "Erfolgreich ausgeloggt"}


# ==================== GÄSTE-TOKEN ENDPOINTS ====================

@router.post("/guest-tokens", response_model=GuestTokenResponse)
async def create_guest_token(
    data: GuestTokenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Erstellt einen neuen Gäste-Token. Nur Admins können das."""
    check_role(current_user, UserRole.ADMIN)

    # Token generieren
    token = secrets.token_urlsafe(32)

    # Ablaufdatum berechnen
    expires_at = None
    if data.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)

    guest_token = GuestToken(
        token=token,
        name=data.name,
        role=data.role,
        expires_at=expires_at,
        created_by_id=current_user.id
    )
    db.add(guest_token)
    db.commit()
    db.refresh(guest_token)

    return GuestTokenResponse(
        id=guest_token.id,
        token=guest_token.token,
        name=guest_token.name,
        role=guest_token.role,
        expires_at=guest_token.expires_at,
        is_active=guest_token.is_active,
        last_used_at=guest_token.last_used_at,
        created_at=guest_token.created_at,
        created_by_username=current_user.username
    )


@router.get("/guest-tokens", response_model=List[GuestTokenResponse])
async def list_guest_tokens(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Listet alle Gäste-Tokens. Nur Admins können das."""
    check_role(current_user, UserRole.ADMIN)

    tokens = db.query(GuestToken).order_by(GuestToken.created_at.desc()).all()

    result = []
    for t in tokens:
        creator = db.query(User).filter(User.id == t.created_by_id).first()
        result.append(GuestTokenResponse(
            id=t.id,
            token=t.token,
            name=t.name,
            role=t.role,
            expires_at=t.expires_at,
            is_active=t.is_active,
            last_used_at=t.last_used_at,
            created_at=t.created_at,
            created_by_username=creator.username if creator else None
        ))
    return result


@router.delete("/guest-tokens/{token_id}")
async def delete_guest_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Löscht einen Gäste-Token permanent. Nur Admins können das."""
    check_role(current_user, UserRole.ADMIN)

    guest_token = db.query(GuestToken).filter(GuestToken.id == token_id).first()
    if not guest_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token nicht gefunden"
        )

    # Auch den zugehörigen Gast-User löschen falls vorhanden
    guest_user = db.query(User).filter(User.username == f"guest_{guest_token.id}").first()
    if guest_user:
        db.delete(guest_user)

    db.delete(guest_token)
    db.commit()
    return {"message": "Token gelöscht"}


@router.post("/guest-tokens/{token_id}/toggle")
async def toggle_guest_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aktiviert/Deaktiviert einen Gäste-Token. Nur Admins können das."""
    check_role(current_user, UserRole.ADMIN)

    guest_token = db.query(GuestToken).filter(GuestToken.id == token_id).first()
    if not guest_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token nicht gefunden"
        )

    guest_token.is_active = not guest_token.is_active
    db.commit()
    return {"is_active": guest_token.is_active}


@router.get("/guest/{token}")
async def guest_login(token: str, db: Session = Depends(get_db)):
    """
    Gäste-Login mit Token.
    Erstellt einen temporären "Gast"-User und gibt JWT zurück.
    """
    guest_token = db.query(GuestToken).filter(GuestToken.token == token).first()

    if not guest_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ungültiger Gäste-Link"
        )

    if not guest_token.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dieser Gäste-Link wurde deaktiviert"
        )

    if guest_token.expires_at and guest_token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dieser Gäste-Link ist abgelaufen"
        )

    # Prüfen ob ein User für diesen Guest-Token existiert, sonst erstellen
    guest_user = db.query(User).filter(
        User.username == f"guest_{guest_token.id}"
    ).first()

    if not guest_user:
        guest_user = User(
            username=f"guest_{guest_token.id}",
            display_name=guest_token.name,
            role=guest_token.role,
            discord_id=None  # Kein Discord
        )
        db.add(guest_user)
        db.commit()
        db.refresh(guest_user)

    # Token-Nutzung aktualisieren
    guest_token.last_used_at = datetime.now(timezone.utc)
    db.commit()

    # JWT Token erstellen
    access_token = create_access_token(data={"sub": str(guest_user.id)})

    # Redirect zum Frontend mit Token
    frontend_url = f"{settings.frontend_url}/auth/success?token={access_token}"
    return RedirectResponse(url=frontend_url)
