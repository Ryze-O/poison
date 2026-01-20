# Deployment auf dem Homeserver

## Einmalige Einrichtung

1. Script ausführbar machen:
```bash
chmod +x /home/poison/poison/deploy.sh
```

2. Sudo ohne Passwort für den Service-Restart (optional):
```bash
sudo visudo
# Am Ende hinzufügen:
poison ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart poison-backend.service
```

## Deployment ausführen

Nach jedem Push einfach:
```bash
cd /home/poison/poison && ./deploy.sh
```

Oder von überall:
```bash
/home/poison/poison/deploy.sh
```

## Was das Script macht

1. `git pull origin main` - Neueste Änderungen holen
2. `npm install && npm run build` - Frontend bauen
3. `pip install -r requirements.txt` - Backend Dependencies
4. `alembic upgrade head` - Datenbank-Migrationen
5. `systemctl restart poison-backend.service` - Backend neustarten

## Alias einrichten (noch einfacher)

In `~/.bashrc` oder `~/.zshrc` hinzufügen:
```bash
alias deploy-poison='/home/poison/poison/deploy.sh'
```

Dann nur noch: `deploy-poison`
