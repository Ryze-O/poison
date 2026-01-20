#!/bin/bash
# Poison Update Script für Homeserver
# Führt alle notwendigen Schritte für ein vollständiges Update aus

set -e  # Bei Fehler abbrechen

PROJECT_DIR="/home/poison/poison"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "========================================="
echo "  Poison Update Script"
echo "========================================="
echo ""

# 1. Git Pull
echo "[1/5] Git Pull..."
cd "$PROJECT_DIR"
git pull origin main

# 2. Backend Dependencies (falls neue Pakete)
echo ""
echo "[2/5] Backend Dependencies prüfen..."
cd "$BACKEND_DIR"
source venv/bin/activate
pip install -r requirements.txt --quiet

# 3. Datenbank Migrationen
echo ""
echo "[3/5] Datenbank Migrationen..."
alembic upgrade head

# 4. Frontend Build
echo ""
echo "[4/5] Frontend Build..."
cd "$FRONTEND_DIR"
npm install --silent
npm run build

# 5. Backend Service neustarten
echo ""
echo "[5/5] Backend Service neustarten..."
systemctl restart poison-backend.service

echo ""
echo "========================================="
echo "  Update abgeschlossen!"
echo "========================================="
echo ""
echo "Status:"
systemctl status poison-backend.service --no-pager -l | head -5
