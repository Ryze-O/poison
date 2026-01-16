import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.models.user import User
from app.schemas.user import UserResponse
from app.auth.discord import get_oauth_url, exchange_code, get_discord_user
from app.auth.jwt import create_access_token, get_current_user

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

    # Benutzer in DB suchen oder anlegen
    user = db.query(User).filter(User.discord_id == discord_user.id).first()
    if not user:
        user = User(
            discord_id=discord_user.id,
            username=discord_user.username,
            display_name=discord_user.global_name,
            avatar=discord_user.avatar_url,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Benutzer-Daten aktualisieren
        user.username = discord_user.username
        user.display_name = discord_user.global_name or user.display_name
        user.avatar = discord_user.avatar_url
        db.commit()

    # JWT Token erstellen
    access_token = create_access_token(data={"sub": user.id})

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
