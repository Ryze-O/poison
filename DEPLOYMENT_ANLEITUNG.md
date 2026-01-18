# Poison Deployment-Anleitung für Dummies

Diese Anleitung erklärt Schritt für Schritt, wie du die Poison-Webapp auf deinem Proxmox-Homeserver installierst und sicher über das Internet erreichbar machst - **ohne eigene Domain und ohne laufende Kosten**.

---

## Inhaltsverzeichnis

1. [Voraussetzungen prüfen](#1-voraussetzungen-prüfen)
2. [Sicherheitskonzept verstehen](#2-sicherheitskonzept-verstehen)
3. [LXC Container in Proxmox erstellen](#3-lxc-container-in-proxmox-erstellen)
4. [Container einrichten](#4-container-einrichten)
5. [Poison installieren](#5-poison-installieren)
6. [Cloudflare Tunnel einrichten](#6-cloudflare-tunnel-einrichten-kostenlos)
7. [Discord OAuth anpassen](#7-discord-oauth-anpassen)
8. [Testen und Starten](#8-testen-und-starten)
9. [Wartung und Updates](#9-wartung-und-updates)

---

## 1. Voraussetzungen prüfen

### Was du brauchst:

| Komponente | Minimum | Empfohlen |
|------------|---------|-----------|
| **Proxmox Server** | Läuft bereits ✓ | - |
| **RAM für Container** | 512 MB | 1 GB |
| **Speicher für Container** | 4 GB | 8 GB |
| **Internetverbindung** | DSL 16 Mbit | Egal, reicht locker |
| **Cloudflare Account** | Kostenlos | Kostenlos |
| **Discord Developer Account** | Kostenlos (hast du bereits) | - |

### Schnellcheck auf deinem Proxmox:

1. Öffne die Proxmox Web-UI: `https://DEINE-PROXMOX-IP:8006`
2. Klicke links auf deinen Node (z.B. "pve")
3. Schau oben rechts auf "Memory" - sollte noch mindestens 1 GB frei sein
4. Schau auf "Storage" - sollte noch mindestens 10 GB frei sein

**Wenn beides passt → weiter zu Schritt 2**

---

## 2. Sicherheitskonzept verstehen

### Warum Cloudflare Tunnel?

```
OHNE Tunnel (unsicher):               MIT Cloudflare Tunnel (sicher):

Internet ──► Dein Router ──► Server   Internet ──► Cloudflare ──► Tunnel ──► Server
     ↑                                      │         │
     │                                      │         ├─ DDoS-Schutz
Port offen = Angriffsfläche                 │         ├─ WAF (Firewall)
                                            │         ├─ Bot-Schutz
                                            │         └─ SSL/HTTPS
                                            │
                                      Kein offener Port bei dir!
```

### Was Cloudflare Tunnel macht:

1. **Kein Port-Forwarding nötig** - Dein Router bleibt komplett zu
2. **Cloudflare filtert Angriffe** - DDoS, Bots, Hacker werden geblockt
3. **Kostenlose SSL-Verschlüsselung** - HTTPS automatisch
4. **Deine echte IP bleibt versteckt** - Angreifer sehen nur Cloudflare

### Zusätzliche Sicherheitsmaßnahmen (optional):

| Maßnahme | Aufwand | Schutz |
|----------|---------|--------|
| **Cloudflare Access** | 5 Min | Nur bestimmte E-Mails dürfen zugreifen |
| **Discord-Login Pflicht** | Bereits drin | Ohne Login sieht man nichts |
| **IP-Whitelist** | 10 Min | Nur Deutschland darf zugreifen |

**Diese Anleitung nutzt: Cloudflare Tunnel + Discord-Login + Optional Access**

---

## 3. LXC Container in Proxmox erstellen

### 3.1 Template herunterladen

1. Öffne Proxmox Web-UI: `https://DEINE-PROXMOX-IP:8006`
2. Links: Klick auf **local (pve)** (oder dein Storage)
3. Mitte: Klick auf **CT Templates**
4. Oben: Klick auf **Templates**
5. Suche nach: `debian-12`
6. Wähle: `debian-12-standard` → **Download**
7. Warte bis fertig (ca. 1-2 Minuten)

### 3.2 Container erstellen

1. Rechtsklick auf deinen Node (z.B. "pve") → **Create CT**

2. **Tab "General":**
   - CT ID: `100` (oder nächste freie Nummer)
   - Hostname: `poison`
   - Password: Ein sicheres Passwort (aufschreiben!)
   - ☑ Unprivileged container (angehakt lassen)

3. **Tab "Template":**
   - Storage: `local`
   - Template: `debian-12-standard...`

4. **Tab "Disks":**
   - Disk size: `8` (GB reicht locker)

5. **Tab "CPU":**
   - Cores: `1` (reicht)

6. **Tab "Memory":**
   - Memory: `1024` (MB)
   - Swap: `512` (MB)

7. **Tab "Network":**
   - Bridge: `vmbr0`
   - IPv4: `DHCP` (einfacher) ODER statische IP
   - IPv6: `DHCP`

8. **Tab "DNS":**
   - Alles leer lassen (nutzt Host-Einstellungen)

9. **Tab "Confirm":**
   - ☑ Start after created
   - Klick auf **Finish**

### 3.3 Container starten und verbinden

1. Warte bis Container erstellt ist
2. Links: Klick auf den Container `100 (poison)`
3. Oben: Klick auf **Console**
4. Login:
   - Login: `root`
   - Password: (dein Passwort von oben)

**Du siehst jetzt:** `root@poison:~#`

---

## 4. Container einrichten

Kopiere diese Befehle **einzeln** in die Konsole und drücke Enter:

### 4.1 System aktualisieren

```bash
apt update && apt upgrade -y
```
(Dauert 1-2 Minuten, bei Fragen einfach Enter drücken)

### 4.2 Benötigte Programme installieren

```bash
apt install -y python3 python3-pip python3-venv nodejs npm git curl wget sudo
```

### 4.3 Neuere Node.js Version installieren (wichtig!)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### 4.4 Tesseract OCR installieren (für Screenshot-Erkennung)

```bash
apt install -y tesseract-ocr tesseract-ocr-deu
```

### 4.5 Benutzer für die App erstellen

```bash
useradd -m -s /bin/bash poison
```

### 4.6 IP-Adresse herausfinden (aufschreiben!)

```bash
ip addr show eth0 | grep "inet "
```

Notiere dir die IP (z.B. `192.168.1.100`) - du brauchst sie später!

---

## 5. Poison installieren

### 5.1 Als poison-Benutzer arbeiten

```bash
su - poison
```

(Prompt ändert sich zu `poison@poison:~$`)

### 5.2 Code von GitHub holen

```bash
git clone https://github.com/Ryze-O/poison.git
cd poison
```

### 5.3 Backend einrichten

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

(Dauert 2-3 Minuten)

### 5.4 Backend-Konfiguration erstellen

```bash
nano .env
```

Füge folgendes ein (mit deinen Werten!):

```
DATABASE_URL=sqlite:///./data/poison.db
DISCORD_CLIENT_ID=DEINE_DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET=DEIN_DISCORD_CLIENT_SECRET
DISCORD_REDIRECT_URI=https://DEINE-TUNNEL-URL/auth/callback
SECRET_KEY=EIN_LANGER_ZUFAELLIGER_STRING_HIER
ADMIN_DISCORD_ID=DEINE_DISCORD_USER_ID
```

**Wichtig:** `DISCORD_REDIRECT_URI` ändern wir später nochmal!

Speichern: `Strg+O`, Enter, `Strg+X`

### 5.5 Datenbank initialisieren

```bash
mkdir -p data
alembic upgrade head
```

### 5.6 Frontend bauen

```bash
cd ../frontend
npm install
```

(Dauert 2-3 Minuten)

Jetzt die Frontend-Konfiguration:

```bash
nano .env
```

Füge ein:

```
VITE_API_URL=https://DEINE-TUNNEL-URL
```

Speichern: `Strg+O`, Enter, `Strg+X`

```bash
npm run build
```

### 5.7 Zurück zum root-Benutzer

```bash
exit
```

---

## 6. Cloudflare Tunnel einrichten (kostenlos)

### 6.1 Cloudflare Account erstellen

1. Gehe zu: https://dash.cloudflare.com/sign-up
2. Erstelle einen kostenlosen Account
3. E-Mail bestätigen

### 6.2 Cloudflare Zero Trust öffnen

1. Nach dem Login: Klick auf **Zero Trust** (links unten)
   - Oder direkt: https://one.dash.cloudflare.com
2. Beim ersten Mal: Wähle den **Free Plan** (kostenlos, 50 User)
3. Team-Name eingeben (z.B. `viper-staffel`) → Weiter

### 6.3 Tunnel erstellen

1. Links: **Networks** → **Tunnels**
2. Klick: **Create a tunnel**
3. Wähle: **Cloudflared** → **Next**
4. Name: `poison-homeserver` → **Save tunnel**

### 6.4 Cloudflared auf deinem Server installieren

Du siehst jetzt Installationsanweisungen. Wähle **Debian** und kopiere den Befehl.

Gehe zurück zur **Proxmox Console** (als root) und führe aus:

```bash
# Cloudflared herunterladen und installieren
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb
```

Jetzt den Token-Befehl von der Cloudflare-Seite ausführen (sieht so aus):

```bash
cloudflared service install DEIN_SEHR_LANGER_TOKEN_HIER
```

### 6.5 Public Hostname konfigurieren

Zurück auf der Cloudflare-Seite:

1. Klick: **Next** (nachdem Connector als "Connected" angezeigt wird)
2. Klick: **Add a public hostname**
3. Fülle aus:
   - **Subdomain:** `poison` (oder was du willst)
   - **Domain:** Wähle `cfargotunnel.com` (kostenlos!) ODER `trycloudflare.com`
   - **Path:** leer lassen
   - **Service Type:** `HTTP`
   - **URL:** `localhost:8000`

4. Klick: **Save hostname**

**Deine URL ist jetzt:** `https://poison.cfargotunnel.com` (oder ähnlich)

**Diese URL aufschreiben!**

### 6.6 Zweiten Hostname für Frontend (optional aber empfohlen)

Für eine saubere Lösung: Backend und Frontend unter einer URL.

1. **Add another hostname**
2. Gleiche Subdomain, aber **Path:** `/` und **Service:** `http://localhost:5173`

ODER einfacher: Wir lassen das Backend die gebauten Frontend-Dateien ausliefern (siehe unten).

---

## 7. Discord OAuth anpassen

### 7.1 Discord Developer Portal öffnen

1. Gehe zu: https://discord.com/developers/applications
2. Wähle deine App (die du für Poison erstellt hast)
3. Links: **OAuth2**

### 7.2 Redirect URL aktualisieren

1. Bei **Redirects**: Klick **Add Redirect**
2. Füge hinzu: `https://DEINE-CLOUDFLARE-URL/auth/callback`
   - Beispiel: `https://poison.cfargotunnel.com/auth/callback`
3. **Save Changes**

### 7.3 Backend .env aktualisieren

Auf dem Server (als root):

```bash
su - poison
cd ~/poison/backend
nano .env
```

Ändere die `DISCORD_REDIRECT_URI`:

```
DISCORD_REDIRECT_URI=https://poison.cfargotunnel.com/auth/callback
```

Speichern: `Strg+O`, Enter, `Strg+X`

### 7.4 Frontend .env aktualisieren

```bash
cd ../frontend
nano .env
```

Ändere:

```
VITE_API_URL=https://poison.cfargotunnel.com
```

Speichern und Frontend neu bauen:

```bash
npm run build
exit
```

---

## 8. Testen und Starten

### 8.1 Systemd Service erstellen (damit es automatisch startet)

Als root auf dem Server:

```bash
nano /etc/systemd/system/poison-backend.service
```

Inhalt:

```ini
[Unit]
Description=Poison Backend API
After=network.target

[Service]
User=poison
WorkingDirectory=/home/poison/poison/backend
Environment="PATH=/home/poison/poison/backend/venv/bin"
ExecStart=/home/poison/poison/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Speichern: `Strg+O`, Enter, `Strg+X`

### 8.2 Service aktivieren und starten

```bash
systemctl daemon-reload
systemctl enable poison-backend
systemctl start poison-backend
```

### 8.3 Status prüfen

```bash
systemctl status poison-backend
```

Du solltest `Active: active (running)` sehen.

### 8.4 Im Browser testen

1. Öffne: `https://DEINE-CLOUDFLARE-URL` (z.B. `https://poison.cfargotunnel.com`)
2. Du solltest die Poison-Login-Seite sehen
3. Klick auf "Mit Discord anmelden"
4. Nach dem Login: Du bist drin!

---

## 9. Wartung und Updates

### Code aktualisieren (wenn du Änderungen gepusht hast)

```bash
su - poison
cd ~/poison
git pull

# Backend aktualisieren
cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head

# Frontend neu bauen
cd ../frontend
npm install
npm run build

exit

# Service neustarten
systemctl restart poison-backend
```

### Logs ansehen

```bash
journalctl -u poison-backend -f
```

(Strg+C zum Beenden)

### Server neustarten

```bash
systemctl restart poison-backend
```

---

## Bonus: Zusätzliche Sicherheit mit Cloudflare Access

### Nur bestimmte E-Mail-Adressen erlauben

1. Cloudflare Zero Trust → **Access** → **Applications**
2. **Add an application** → **Self-hosted**
3. Application name: `Poison`
4. Session Duration: `24 hours`
5. Application domain: `poison.cfargotunnel.com`
6. **Next**

7. Policy name: `Viper Staffel Only`
8. Action: `Allow`
9. Include: **Emails** → Füge die E-Mails deiner Offiziere hinzu
   - `deine@email.de`
   - `offizier1@email.de`
   - etc.
10. **Next** → **Add application**

**Jetzt müssen sich User erst bei Cloudflare authentifizieren, bevor sie überhaupt die Seite sehen!**

---

## Fehlerbehebung

### "Bad Gateway" oder Seite lädt nicht

```bash
# Läuft der Service?
systemctl status poison-backend

# Logs prüfen
journalctl -u poison-backend -n 50
```

### "Discord OAuth Fehler"

- Prüfe ob die Redirect-URL in Discord EXAKT mit deiner .env übereinstimmt
- Kein Trailing Slash am Ende!

### Container startet nicht

```bash
# In Proxmox: Container auswählen → Start
# Oder via SSH:
pct start 100
```

### Cloudflare Tunnel offline

```bash
systemctl status cloudflared
systemctl restart cloudflared
```

---

## Zusammenfassung

| Was | Wo |
|-----|-----|
| **Proxmox Web-UI** | `https://DEINE-PROXMOX-IP:8006` |
| **Container Console** | Proxmox → Container 100 → Console |
| **Poison URL** | `https://poison.cfargotunnel.com` (oder deine) |
| **Backend Logs** | `journalctl -u poison-backend -f` |
| **Service neustarten** | `systemctl restart poison-backend` |

---

## Kosten-Übersicht

| Komponente | Kosten |
|------------|--------|
| Proxmox | Kostenlos (Open Source) |
| Debian Container | Kostenlos |
| Cloudflare Tunnel | Kostenlos |
| Cloudflare Access (50 User) | Kostenlos |
| Discord OAuth | Kostenlos |
| **Gesamt** | **0 €** |

---

*Erstellt für die Staffel Viper - Das Kartell*
