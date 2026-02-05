import secrets
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.database import get_db
from app.config import get_settings
from app.models.user import User, UserRole, GuestToken, PendingMerge
from app.schemas.user import UserResponse, GuestTokenCreate, GuestTokenResponse, GuestLoginResponse, PasswordRegister, PasswordLogin, PasswordResetByAdmin
from app.auth.discord import get_oauth_url, exchange_code, get_discord_user, get_user_guilds, is_member_of_guild
from app.auth.jwt import create_access_token, get_current_user
from app.auth.dependencies import check_role

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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

        # Nach existierendem User ohne Discord suchen (für Auto-Merge)
        potential_match = None
        match_reason = None

        # Suche nach Username-Match (case-insensitive)
        potential_match = db.query(User).filter(
            User.discord_id.is_(None),
            User.username.ilike(discord_user.username)
        ).first()
        if potential_match:
            match_reason = "username_match"

        # Falls kein Username-Match, nach Display-Name suchen
        if not potential_match and discord_user.global_name:
            potential_match = db.query(User).filter(
                User.discord_id.is_(None),
                User.display_name.ilike(discord_user.global_name)
            ).first()
            if potential_match:
                match_reason = "display_name_match"

        # Falls kein Display-Name-Match, nach Alias suchen
        if not potential_match:
            # Suche in Aliase (case-insensitive)
            all_users_with_aliases = db.query(User).filter(
                User.discord_id.is_(None),
                User.aliases.isnot(None)
            ).all()
            search_names = [discord_user.username.lower()]
            if discord_user.global_name:
                search_names.append(discord_user.global_name.lower())

            for u in all_users_with_aliases:
                aliases = [a.strip().lower() for a in u.aliases.split(',') if a.strip()]
                if any(name in aliases for name in search_names):
                    potential_match = u
                    match_reason = "alias_match"
                    break

        # Neuen User anlegen
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

        # Falls Match gefunden, Merge-Vorschlag erstellen
        if potential_match and not is_admin:
            pending_merge = PendingMerge(
                discord_user_id=user.id,
                existing_user_id=potential_match.id,
                match_reason=match_reason,
                status="pending"
            )
            db.add(pending_merge)
            db.commit()
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


# ==================== PASSWORD AUTHENTICATION ENDPOINTS ====================

@router.post("/register", response_model=UserResponse)
async def register_with_password(data: PasswordRegister, db: Session = Depends(get_db)):
    """
    Registriert einen neuen User mit Username/Passwort.
    User wird mit is_pending=True erstellt und muss von Admin freigeschaltet werden.
    """
    # Prüfe ob Username bereits existiert
    existing_user = db.query(User).filter(User.username.ilike(data.username)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ein Benutzer mit diesem Namen existiert bereits"
        )

    # Passwort hashen
    password_hash = pwd_context.hash(data.password)

    # User erstellen (pending)
    user = User(
        username=data.username,
        display_name=data.display_name or data.username,
        password_hash=password_hash,
        role=UserRole.GUEST,  # Startet als Guest
        is_pending=True,  # Muss freigeschaltet werden
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.post("/login/password")
async def login_with_password(data: PasswordLogin, db: Session = Depends(get_db)):
    """
    Login mit Username/Passwort.
    Gibt JWT-Token zurück wenn erfolgreich.
    """
    # User suchen
    user = db.query(User).filter(User.username.ilike(data.username)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültiger Benutzername oder Passwort"
        )

    # Prüfe ob User Passwort hat (könnte Discord-only sein)
    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Dieser Account verwendet Discord-Login. Bitte melde dich über Discord an."
        )

    # Passwort prüfen
    if not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültiger Benutzername oder Passwort"
        )

    # Prüfe ob User freigeschaltet ist
    if user.is_pending:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dein Account wartet noch auf Freischaltung durch einen Admin"
        )

    # Token erstellen
    access_token = create_access_token(data={"sub": str(user.id)})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(user)
    }


@router.post("/approve-user/{user_id}", response_model=UserResponse)
async def approve_pending_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Admin schaltet einen wartenden User frei.
    Setzt is_pending auf False und Rolle auf MEMBER.
    """
    check_role(current_user, UserRole.ADMIN)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    if not user.is_pending:
        raise HTTPException(status_code=400, detail="Benutzer wartet nicht auf Freischaltung")

    user.is_pending = False
    user.role = UserRole.MEMBER  # Upgrade von GUEST zu MEMBER
    db.commit()
    db.refresh(user)

    return user


@router.post("/reject-user/{user_id}")
async def reject_pending_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Admin lehnt einen wartenden User ab (löscht ihn).
    """
    check_role(current_user, UserRole.ADMIN)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    if not user.is_pending:
        raise HTTPException(status_code=400, detail="Benutzer wartet nicht auf Freischaltung")

    db.delete(user)
    db.commit()

    return {"message": f"Benutzer '{user.username}' wurde abgelehnt und gelöscht"}


@router.post("/reset-password")
async def admin_reset_password(
    data: PasswordResetByAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Admin setzt Passwort für einen User zurück.
    """
    check_role(current_user, UserRole.ADMIN)

    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Neues Passwort hashen
    user.password_hash = pwd_context.hash(data.new_password)
    db.commit()

    return {"message": f"Passwort für '{user.username}' wurde zurückgesetzt"}


@router.get("/pending-users", response_model=List[UserResponse])
async def get_pending_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Gibt alle User zurück die auf Freischaltung warten.
    Nur für Admins.
    """
    check_role(current_user, UserRole.ADMIN)
    return db.query(User).filter(User.is_pending == True).all()


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
