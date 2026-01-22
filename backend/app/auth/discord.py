import httpx
from typing import Optional
from dataclasses import dataclass

from app.config import get_settings

settings = get_settings()

DISCORD_API_BASE = "https://discord.com/api/v10"
DISCORD_OAUTH_URL = "https://discord.com/oauth2/authorize"
DISCORD_TOKEN_URL = f"{DISCORD_API_BASE}/oauth2/token"


@dataclass
class DiscordUser:
    """Discord-Benutzer Daten."""
    id: str
    username: str
    global_name: Optional[str]
    avatar: Optional[str]

    @property
    def avatar_url(self) -> Optional[str]:
        if self.avatar:
            return f"https://cdn.discordapp.com/avatars/{self.id}/{self.avatar}.png"
        return None


def get_oauth_url(state: str) -> str:
    """Generiert die Discord OAuth2 URL."""
    params = {
        "client_id": settings.discord_client_id,
        "redirect_uri": settings.discord_redirect_uri,
        "response_type": "code",
        "scope": "identify guilds",
        "state": state,
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{DISCORD_OAUTH_URL}?{query}"


async def exchange_code(code: str) -> Optional[str]:
    """Tauscht den OAuth-Code gegen einen Access Token."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            DISCORD_TOKEN_URL,
            data={
                "client_id": settings.discord_client_id,
                "client_secret": settings.discord_client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.discord_redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if response.status_code != 200:
            return None

        data = response.json()
        return data.get("access_token")


async def get_discord_user(access_token: str) -> Optional[DiscordUser]:
    """Holt die Benutzer-Daten von Discord."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{DISCORD_API_BASE}/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if response.status_code != 200:
            return None

        data = response.json()
        return DiscordUser(
            id=data["id"],
            username=data["username"],
            global_name=data.get("global_name"),
            avatar=data.get("avatar"),
        )


async def get_user_guilds(access_token: str) -> list[dict]:
    """Ruft die Server-Liste des Users ab."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{DISCORD_API_BASE}/users/@me/guilds",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.status_code != 200:
            return []
        return response.json()


def is_member_of_guild(guilds: list[dict], guild_id: str) -> bool:
    """Prüft ob User Mitglied eines bestimmten Servers ist."""
    return any(g["id"] == guild_id for g in guilds)
