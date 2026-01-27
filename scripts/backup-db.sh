#!/bin/bash
# Poison Database Backup Script
# Cronjob: 0 3 * * * /home/poison/poison/scripts/backup-db.sh

BACKUP_DIR="/home/poison/backups"
DB_PATH="/home/poison/poison/backend/data/poison.db"
DATE=$(date +%Y-%m-%d)
KEEP_DAYS=30

# Backup-Ordner erstellen falls nicht vorhanden
mkdir -p "$BACKUP_DIR"

# Backup erstellen (SQLite-sicher mit .backup Befehl)
if command -v sqlite3 &> /dev/null; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/poison_$DATE.db'"
else
    # Fallback: einfache Kopie (sicher wenn DB nicht gerade schreibt)
    cp "$DB_PATH" "$BACKUP_DIR/poison_$DATE.db"
fi

# Alte Backups löschen (älter als 30 Tage)
find "$BACKUP_DIR" -name "poison_*.db" -mtime +$KEEP_DAYS -delete

echo "$(date): Backup erstellt: poison_$DATE.db" >> "$BACKUP_DIR/backup.log"
