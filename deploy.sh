#!/bin/bash
# Poison Deployment Script
# Verwendung: ./deploy.sh oder bash deploy.sh

set -e  # Bei Fehler abbrechen

POISON_DIR="/home/poison/poison"
cd "$POISON_DIR"

echo "=== Poison Deployment ==="
echo ""

# 1. Git Pull
echo "[1/4] Git Pull..."
git pull origin main

# 2. Frontend Build
echo "[2/4] Frontend Build..."
cd frontend
npm install --silent
npm run build
cd ..

# 3. Backend Dependencies (falls requirements.txt geändert)
echo "[3/4] Backend Dependencies prüfen..."
cd backend
source venv/bin/activate
pip install -r requirements.txt --quiet
cd ..

# 4. Alembic Migrations (falls neue vorhanden)
echo "[4/4] Datenbank-Migrationen..."
cd backend
source venv/bin/activate
alembic upgrade head
cd ..

# 5. Service neustarten
echo ""
echo "=== Backend neustarten ==="
sudo systemctl restart poison-backend.service

# Status prüfen
sleep 2
if systemctl is-active --quiet poison-backend.service; then
    echo "✓ Backend läuft"
else
    echo "✗ Backend Fehler! Logs prüfen mit: journalctl -u poison-backend.service -n 50"
    exit 1
fi

echo ""
echo "=== Deployment erfolgreich! ==="
