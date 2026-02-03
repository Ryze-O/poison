"""
Script zum Setzen von Discord Default-Avataren.

Setzt für User mit discord_id aber ohne Avatar das Discord-Default-Avatar.
Benötigt keinen Bot-Token.

Verwendung:
    cd backend
    python -m scripts.set_default_avatars
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.user import User


def get_default_avatar_url(discord_id: str) -> str:
    """Berechnet die Default-Avatar-URL basierend auf Discord ID."""
    # Neue Discord-Formel (seit 2023)
    index = (int(discord_id) >> 22) % 6
    return f"https://cdn.discordapp.com/embed/avatars/{index}.png"


def main():
    print("="*60)
    print("DEFAULT DISCORD AVATARE SETZEN")
    print("="*60)

    db = SessionLocal()

    try:
        # User mit discord_id aber ohne Avatar
        users = db.query(User).filter(
            User.discord_id.isnot(None),
            User.avatar.is_(None)
        ).all()

        if not users:
            print("\n✅ Alle User mit Discord ID haben bereits ein Avatar!")
            return

        print(f"\n{len(users)} User ohne Avatar gefunden:\n")

        for user in users:
            default_url = get_default_avatar_url(user.discord_id)
            user.avatar = default_url
            print(f"  {user.display_name or user.username}: {default_url}")

        db.commit()
        print(f"\n✅ {len(users)} Default-Avatare gesetzt!")
        print("\nHinweis: Wenn User sich über Discord einloggen, wird ihr")
        print("         echtes Avatar automatisch übernommen.")

    except Exception as e:
        print(f"\n❌ FEHLER: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
