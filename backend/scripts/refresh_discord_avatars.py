"""
Script zum Aktualisieren von Discord-Avataren.

Dieses Script holt Avatare für User die eine discord_id haben aber kein Avatar.
Benötigt einen Discord Bot Token in der Umgebungsvariable DISCORD_BOT_TOKEN.

Verwendung:
    cd backend
    set DISCORD_BOT_TOKEN=your_bot_token_here
    python -m scripts.refresh_discord_avatars

Falls kein Bot-Token vorhanden ist, müssen User sich einfach einmal über Discord einloggen.
"""

import sys
import os
import httpx
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.user import User


DISCORD_API_BASE = "https://discord.com/api/v10"


async def fetch_discord_user(bot_token: str, discord_id: str) -> dict | None:
    """Holt User-Daten von Discord via Bot-Token."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{DISCORD_API_BASE}/users/{discord_id}",
            headers={"Authorization": f"Bot {bot_token}"},
        )
        if response.status_code == 200:
            return response.json()
        print(f"    Discord API Error: {response.status_code}")
        return None


def get_avatar_url(discord_id: str, avatar_hash: str | None) -> str | None:
    """Konstruiert die Avatar-URL."""
    if avatar_hash:
        return f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar_hash}.png"
    # Default Avatar basierend auf User ID (neue Discord-Formel)
    index = (int(discord_id) >> 22) % 6
    return f"https://cdn.discordapp.com/embed/avatars/{index}.png"


async def main():
    print("="*60)
    print("DISCORD AVATARE AKTUALISIEREN")
    print("="*60)

    bot_token = os.environ.get("DISCORD_BOT_TOKEN")

    if not bot_token:
        print("\n⚠️  Kein DISCORD_BOT_TOKEN gefunden!")
        print("\nOptionen:")
        print("1. Bot-Token setzen: set DISCORD_BOT_TOKEN=your_token")
        print("2. User manuell einloggen lassen (Discord OAuth)")
        print("\nZeige User ohne Avatar...")

        db = SessionLocal()
        users = db.query(User).filter(
            User.discord_id.isnot(None),
            User.avatar.is_(None)
        ).all()

        if users:
            print(f"\n{len(users)} User ohne Avatar:")
            for u in users:
                # Zeige Default-Avatar URL
                default_url = get_avatar_url(u.discord_id, None)
                print(f"  - {u.display_name or u.username} (Discord: {u.discord_id})")
                print(f"    Default Avatar: {default_url}")
        else:
            print("\nAlle User mit Discord ID haben bereits ein Avatar!")

        db.close()
        return

    print(f"\nBot-Token gefunden, aktualisiere Avatare...")

    db = SessionLocal()

    try:
        users = db.query(User).filter(
            User.discord_id.isnot(None)
        ).all()

        updated = 0
        for user in users:
            print(f"\n  {user.display_name or user.username} (Discord: {user.discord_id}):")

            discord_data = await fetch_discord_user(bot_token, user.discord_id)
            if not discord_data:
                print("    SKIP: Konnte Discord-Daten nicht abrufen")
                continue

            avatar_hash = discord_data.get("avatar")
            new_avatar_url = get_avatar_url(user.discord_id, avatar_hash)

            if user.avatar != new_avatar_url:
                user.avatar = new_avatar_url
                print(f"    UPDATED: {new_avatar_url}")
                updated += 1
            else:
                print(f"    OK: Avatar bereits aktuell")

        db.commit()
        print(f"\n✅ {updated} Avatare aktualisiert!")

    except Exception as e:
        print(f"\n❌ FEHLER: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
